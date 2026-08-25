#include <windows.h>
#include <gl/GL.h>

#include <algorithm>
#include <chrono>
#include <climits>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace {

constexpr std::uint32_t kInputMagic = 0x4E494D50;  // PMIN
constexpr std::uint32_t kOutputMagic = 0x544F4D50; // PMOT
constexpr std::uint16_t kProtocolVersion = 2;
constexpr std::uint32_t kMaxControlPayload = 16U * 1024U * 1024U;
constexpr std::uint32_t kMaxDimension = 4096;

enum class InputType : std::uint16_t {
    Initialize = 1,
    Shutdown = 2,
    LoadPreset = 3,
    Step = 4,
    Reset = 5,
    Ping = 6,
    SetPresetLocked = 7
};

enum class OutputType : std::uint16_t {
    Status = 100,
    Ack = 101,
    Frame = 102,
    Error = 103
};

#pragma pack(push, 1)
struct PacketHeader {
    std::uint32_t magic;
    std::uint16_t version;
    std::uint16_t type;
    std::uint32_t requestId;
    std::uint32_t payloadSize;
    std::uint32_t arg0;
    std::uint32_t arg1;
};

struct StepMeta {
    std::uint32_t width;
    std::uint32_t height;
    std::uint32_t steps;
    std::uint32_t channels;
    std::uint32_t sampleCount;
};

struct FrameMeta {
    std::uint32_t width;
    std::uint32_t height;
    std::uint32_t stride;
    std::uint32_t pcmSamples;
    std::uint64_t frameIndex;
    std::uint64_t renderMicros;
    std::uint32_t advancedFrames;
    std::uint32_t reserved;
};
#pragma pack(pop)

static_assert(sizeof(PacketHeader) == 24);
static_assert(sizeof(StepMeta) == 20);
static_assert(sizeof(FrameMeta) == 40);

using ProjectMHandle = void*;
using ProjectMChannels = int;
using PresetFailedCallback = void (*)(const char*, const char*, void*);

using ProjectMCreateWithSeed = ProjectMHandle (*)(std::uint64_t);
using ProjectMDestroy = void (*)(ProjectMHandle);
using ProjectMLoadPresetData = void (*)(ProjectMHandle, const char*, bool);
using ProjectMRenderFrame = void (*)(ProjectMHandle);
using ProjectMPcmGetMaxSamples = unsigned int (*)();
using ProjectMPcmAddFloat =
    void (*)(ProjectMHandle, const float*, unsigned int, ProjectMChannels);
using ProjectMSetFps = void (*)(ProjectMHandle, std::int32_t);
using ProjectMSetWindowSize =
    void (*)(ProjectMHandle, std::size_t, std::size_t);
using ProjectMSetAspectCorrection = void (*)(ProjectMHandle, bool);
using ProjectMSetPresetLocked = void (*)(ProjectMHandle, bool);
using ProjectMSetSoftCutDuration = void (*)(ProjectMHandle, double);
using ProjectMGetVersionComponents = void (*)(int*, int*, int*);
using ProjectMSetPresetFailedCallback =
    void (*)(ProjectMHandle, PresetFailedCallback, void*);
using ProjectMSetTextureSearchPaths =
    void (*)(ProjectMHandle, const char**, std::size_t);

std::string jsonEscape(const std::string& input) {
    std::ostringstream output;
    for (const unsigned char value : input) {
        switch (value) {
        case '"':
            output << "\\\"";
            break;
        case '\\':
            output << "\\\\";
            break;
        case '\b':
            output << "\\b";
            break;
        case '\f':
            output << "\\f";
            break;
        case '\n':
            output << "\\n";
            break;
        case '\r':
            output << "\\r";
            break;
        case '\t':
            output << "\\t";
            break;
        default:
            if (value < 0x20) {
                output << "\\u00";
                constexpr char digits[] = "0123456789abcdef";
                output << digits[value >> 4] << digits[value & 0x0f];
            } else {
                output << static_cast<char>(value);
            }
        }
    }
    return output.str();
}

std::string windowsError(const DWORD code = GetLastError()) {
    LPWSTR message = nullptr;
    const DWORD length = FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
            FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr, code, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
        reinterpret_cast<LPWSTR>(&message), 0, nullptr);
    std::wstring wide =
        length && message ? std::wstring(message, length) : L"errore sconosciuto";
    if (message) {
        LocalFree(message);
    }
    const int bytes =
        WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), static_cast<int>(wide.size()),
                            nullptr, 0, nullptr, nullptr);
    std::string result(static_cast<std::size_t>(std::max(0, bytes)), '\0');
    if (bytes > 0) {
        WideCharToMultiByte(CP_UTF8, 0, wide.c_str(),
                            static_cast<int>(wide.size()), result.data(), bytes,
                            nullptr, nullptr);
    }
    while (!result.empty() &&
           (result.back() == '\r' || result.back() == '\n' ||
            result.back() == ' ')) {
        result.pop_back();
    }
    return result;
}

std::string wideToUtf8(const std::wstring& wide) {
    if (wide.empty()) {
        return {};
    }
    const int bytes = WideCharToMultiByte(
        CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0,
        nullptr, nullptr);
    std::string result(static_cast<std::size_t>(std::max(0, bytes)), '\0');
    if (bytes > 0) {
        WideCharToMultiByte(CP_UTF8, 0, wide.data(),
                            static_cast<int>(wide.size()), result.data(), bytes,
                            nullptr, nullptr);
    }
    return result;
}

bool utf8ToWideStrict(std::string_view utf8, std::wstring& wide,
                      std::string& error) {
    wide.clear();
    if (utf8.empty()) {
        error = "Percorso preset UTF-8 vuoto.";
        return false;
    }
    if (utf8.find('\0') != std::string_view::npos) {
        error = "Percorso preset UTF-8 con byte NUL.";
        return false;
    }
    if (utf8.size() > static_cast<std::size_t>(INT_MAX)) {
        error = "Percorso preset UTF-8 troppo lungo.";
        return false;
    }
    const int chars = MultiByteToWideChar(
        CP_UTF8, MB_ERR_INVALID_CHARS, utf8.data(),
        static_cast<int>(utf8.size()), nullptr, 0);
    if (chars <= 0) {
        error = "Percorso preset con UTF-8 malformato.";
        return false;
    }
    if (chars >= 32767) {
        error = "Percorso preset oltre il limite Windows di 32767 caratteri.";
        return false;
    }
    wide.resize(static_cast<std::size_t>(chars));
    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8.data(),
                            static_cast<int>(utf8.size()), wide.data(),
                            chars) != chars) {
        error = "Conversione esplicita UTF-8/UTF-16 non riuscita.";
        wide.clear();
        return false;
    }
    return true;
}

bool absoluteExtendedPath(const std::wstring& input, std::wstring& output,
                          std::string& error) {
    if (input.rfind(LR"(\\.\)", 0) == 0) {
        error = "I device path Windows non sono ammessi.";
        return false;
    }
    if (input.rfind(LR"(\\?\)", 0) == 0) {
        output = input;
        return true;
    }
    const DWORD required = GetFullPathNameW(input.c_str(), 0, nullptr, nullptr);
    if (required == 0 || required >= 32767) {
        error = "Normalizzazione wide del percorso preset non riuscita: " +
                windowsError();
        return false;
    }
    std::wstring absolute(required, L'\0');
    const DWORD written =
        GetFullPathNameW(input.c_str(), required, absolute.data(), nullptr);
    if (written == 0 || written >= required) {
        error = "Normalizzazione wide del percorso preset non riuscita: " +
                windowsError();
        return false;
    }
    absolute.resize(written);
    if (absolute.rfind(LR"(\\)", 0) == 0) {
        output = LR"(\\?\UNC\)" + absolute.substr(2);
    } else {
        output = LR"(\\?\)" + absolute;
    }
    return true;
}

bool readPresetWide(const std::wstring& path, std::vector<char>& data,
                    std::string& error) {
    const HANDLE file =
        CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                    OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        error = "Preset non apribile tramite API Windows wide: " +
                windowsError();
        return false;
    }
    LARGE_INTEGER size{};
    if (!GetFileSizeEx(file, &size) || size.QuadPart <= 0 ||
        size.QuadPart > static_cast<LONGLONG>(kMaxControlPayload)) {
        CloseHandle(file);
        error = "Dimensione preset non valida o oltre il limite.";
        return false;
    }
    data.assign(static_cast<std::size_t>(size.QuadPart) + 1, '\0');
    std::size_t offset = 0;
    while (offset < static_cast<std::size_t>(size.QuadPart)) {
        DWORD received = 0;
        const DWORD chunk = static_cast<DWORD>(std::min<std::size_t>(
            static_cast<std::size_t>(size.QuadPart) - offset, 1024U * 1024U));
        if (!ReadFile(file, data.data() + offset, chunk, &received, nullptr) ||
            received == 0) {
            CloseHandle(file);
            error = "Lettura preset tramite API Windows wide non riuscita: " +
                    windowsError();
            data.clear();
            return false;
        }
        offset += received;
    }
    CloseHandle(file);
    if (std::find(data.begin(), data.end() - 1, '\0') != data.end() - 1) {
        error = "Il preset contiene byte NUL non ammessi.";
        data.clear();
        return false;
    }
    return true;
}

std::string projectMTexturePath(const std::wstring& presetPath) {
    const std::wstring parent =
        std::filesystem::path(presetPath).parent_path().wstring();
    const DWORD required = GetShortPathNameW(parent.c_str(), nullptr, 0);
    if (required > 0) {
        std::wstring shortPath(required, L'\0');
        const DWORD written =
            GetShortPathNameW(parent.c_str(), shortPath.data(), required);
        if (written > 0 && written < required) {
            shortPath.resize(written);
            return wideToUtf8(shortPath);
        }
    }
    return wideToUtf8(parent);
}

bool readExact(HANDLE input, void* destination, std::size_t size) {
    auto* cursor = static_cast<std::uint8_t*>(destination);
    while (size > 0) {
        DWORD received = 0;
        const DWORD chunk =
            static_cast<DWORD>(std::min<std::size_t>(size, 1024U * 1024U));
        if (!ReadFile(input, cursor, chunk, &received, nullptr) ||
            received == 0) {
            return false;
        }
        cursor += received;
        size -= received;
    }
    return true;
}

bool writeExact(HANDLE output, const void* source, std::size_t size) {
    const auto* cursor = static_cast<const std::uint8_t*>(source);
    while (size > 0) {
        DWORD written = 0;
        const DWORD chunk =
            static_cast<DWORD>(std::min<std::size_t>(size, 1024U * 1024U));
        if (!WriteFile(output, cursor, chunk, &written, nullptr) ||
            written == 0) {
            return false;
        }
        cursor += written;
        size -= written;
    }
    return true;
}

bool sendPacket(HANDLE output, OutputType type, std::uint32_t requestId,
                const void* payload, std::uint32_t payloadSize,
                std::uint32_t arg0 = 0, std::uint32_t arg1 = 0) {
    const PacketHeader header{kOutputMagic,
                              kProtocolVersion,
                              static_cast<std::uint16_t>(type),
                              requestId,
                              payloadSize,
                              arg0,
                              arg1};
    return writeExact(output, &header, sizeof(header)) &&
           (payloadSize == 0 || writeExact(output, payload, payloadSize));
}

bool sendJson(HANDLE output, OutputType type, std::uint32_t requestId,
              const std::string& json) {
    return sendPacket(output, type, requestId, json.data(),
                      static_cast<std::uint32_t>(json.size()));
}

class WglContext {
  public:
    ~WglContext() { close(); }

    bool create(std::uint32_t width, std::uint32_t height,
                std::string& error) {
        close();
        instance_ = GetModuleHandleW(nullptr);
        WNDCLASSW windowClass{};
        windowClass.style = CS_OWNDC;
        windowClass.lpfnWndProc = DefWindowProcW;
        windowClass.hInstance = instance_;
        windowClass.lpszClassName = L"AvsProjectMHostWindow";
        classAtom_ = RegisterClassW(&windowClass);
        if (!classAtom_ && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            error = "RegisterClassW: " + windowsError();
            return false;
        }

        window_ = CreateWindowExW(
            WS_EX_TOOLWINDOW, windowClass.lpszClassName, L"projectM host",
            WS_POPUP | WS_CLIPSIBLINGS | WS_CLIPCHILDREN, 0, 0,
            static_cast<int>(width), static_cast<int>(height), nullptr, nullptr,
            instance_, nullptr);
        if (!window_) {
            error = "CreateWindowExW: " + windowsError();
            return false;
        }

        device_ = GetDC(window_);
        PIXELFORMATDESCRIPTOR descriptor{};
        descriptor.nSize = sizeof(descriptor);
        descriptor.nVersion = 1;
        descriptor.dwFlags =
            PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
        descriptor.iPixelType = PFD_TYPE_RGBA;
        descriptor.cColorBits = 32;
        descriptor.cAlphaBits = 8;
        descriptor.cDepthBits = 24;
        descriptor.cStencilBits = 8;
        descriptor.iLayerType = PFD_MAIN_PLANE;
        const int format = ChoosePixelFormat(device_, &descriptor);
        if (!format || !SetPixelFormat(device_, format, &descriptor)) {
            error = "Impossibile configurare il pixel format OpenGL: " +
                    windowsError();
            return false;
        }

        HGLRC legacy = wglCreateContext(device_);
        if (!legacy || !wglMakeCurrent(device_, legacy)) {
            error = "Impossibile creare il contesto OpenGL iniziale: " +
                    windowsError();
            if (legacy) {
                wglDeleteContext(legacy);
            }
            return false;
        }

        using CreateContextAttribs = HGLRC(WINAPI*)(HDC, HGLRC, const int*);
        const auto createContextAttribs =
            reinterpret_cast<CreateContextAttribs>(
                wglGetProcAddress("wglCreateContextAttribsARB"));
        if (!createContextAttribs) {
            wglMakeCurrent(nullptr, nullptr);
            wglDeleteContext(legacy);
            error = "Il driver non espone wglCreateContextAttribsARB.";
            return false;
        }

        constexpr int kWglContextMajor = 0x2091;
        constexpr int kWglContextMinor = 0x2092;
        constexpr int kWglContextProfileMask = 0x9126;
        constexpr int kWglContextCoreProfile = 0x00000001;
        const int attributes[] = {kWglContextMajor,
                                  3,
                                  kWglContextMinor,
                                  3,
                                  kWglContextProfileMask,
                                  kWglContextCoreProfile,
                                  0};
        context_ = createContextAttribs(device_, nullptr, attributes);
        wglMakeCurrent(nullptr, nullptr);
        wglDeleteContext(legacy);
        if (!context_ || !wglMakeCurrent(device_, context_)) {
            error = "Impossibile creare un contesto OpenGL Core 3.3: " +
                    windowsError();
            return false;
        }

        resize(width, height);
        return true;
    }

    void resize(std::uint32_t width, std::uint32_t height) {
        width_ = width;
        height_ = height;
        if (window_) {
            SetWindowPos(window_, nullptr, 0, 0, static_cast<int>(width),
                         static_cast<int>(height),
                         SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
        glViewport(0, 0, static_cast<GLsizei>(width),
                   static_cast<GLsizei>(height));
    }

    std::string renderer() const {
        const auto* value = glGetString(GL_RENDERER);
        return value ? reinterpret_cast<const char*>(value) : "sconosciuto";
    }

    std::string version() const {
        const auto* value = glGetString(GL_VERSION);
        return value ? reinterpret_cast<const char*>(value) : "sconosciuta";
    }

    void close() {
        if (context_) {
            wglMakeCurrent(nullptr, nullptr);
            wglDeleteContext(context_);
            context_ = nullptr;
        }
        if (device_ && window_) {
            ReleaseDC(window_, device_);
            device_ = nullptr;
        }
        if (window_) {
            DestroyWindow(window_);
            window_ = nullptr;
        }
        if (classAtom_ && instance_) {
            UnregisterClassW(L"AvsProjectMHostWindow", instance_);
            classAtom_ = 0;
        }
    }

  private:
    HINSTANCE instance_ = nullptr;
    ATOM classAtom_ = 0;
    HWND window_ = nullptr;
    HDC device_ = nullptr;
    HGLRC context_ = nullptr;
    std::uint32_t width_ = 0;
    std::uint32_t height_ = 0;
};

class ProjectMRuntime {
  public:
    ~ProjectMRuntime() { close(); }

    bool initialize(const std::filesystem::path& dllPath, std::uint32_t width,
                    std::uint32_t height, std::uint64_t deterministicSeed,
                    std::string& error) {
        close();
        if (!context_.create(width, height, error)) {
            return false;
        }

        SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS |
                                 LOAD_LIBRARY_SEARCH_USER_DIRS);
        library_ = LoadLibraryExW(
            dllPath.c_str(), nullptr,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR |
                LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!library_) {
            error = "Libreria projectM non caricabile da " +
                    wideToUtf8(dllPath.wstring()) + ": " + windowsError();
            context_.close();
            return false;
        }

        if (!loadFunctions(error)) {
            close();
            return false;
        }

        const HMODULE glew = GetModuleHandleW(L"glew32.dll");
        using GlewInit = unsigned int (*)();
        const auto glewInit =
            glew ? reinterpret_cast<GlewInit>(GetProcAddress(glew, "glewInit"))
                 : nullptr;
        if (!glewInit) {
            error = "GLEW caricato da projectM ma glewInit non disponibile.";
            close();
            return false;
        }
        const unsigned int glewResult = glewInit();
        if (glewResult != 0) {
            error = "glewInit non riuscito (codice " +
                    std::to_string(glewResult) + ").";
            close();
            return false;
        }
        // GLEW can leave GL_INVALID_ENUM set on a core context.
        while (glGetError() != GL_NO_ERROR) {
        }

        handle_ = createWithSeed_(deterministicSeed);
        if (!handle_) {
            error =
                "projectm_create_with_seed() non ha creato il motore. "
                "Verificare OpenGL.";
            close();
            return false;
        }

        width_ = width;
        height_ = height;
        deterministicSeed_ = deterministicSeed;
        setFps_(handle_, 30);
        setWindowSize_(handle_, width_, height_);
        setAspectCorrection_(handle_, true);
        setPresetLocked_(handle_, true);
        setPresetFailedCallback_(handle_, &ProjectMRuntime::presetFailed,
                                 this);
        pcmMaxSamples_ = std::max(1U, pcmGetMaxSamples_());
        getVersionComponents_(&versionMajor_, &versionMinor_, &versionPatch_);
        return true;
    }

    bool reset(const std::filesystem::path& dllPath, std::uint32_t width,
               std::uint32_t height, std::uint64_t deterministicSeed,
               std::string& error) {
        const std::string preset = presetPath_;
        if (!initialize(dllPath, width, height, deterministicSeed, error)) {
            return false;
        }
        if (!preset.empty()) {
            return loadPreset(preset, false, 0.0, error);
        }
        return true;
    }

    bool loadPreset(const std::string& path, bool smoothTransition,
                    double transitionSeconds, std::string& error) {
        if (!handle_) {
            error = "Motore projectM non inizializzato.";
            return false;
        }
        std::wstring decodedPath;
        if (!utf8ToWideStrict(path, decodedPath, error)) {
            return false;
        }
        std::wstring widePath;
        if (!absoluteExtendedPath(decodedPath, widePath, error)) {
            return false;
        }
        std::vector<char> presetData;
        if (!readPresetWide(widePath, presetData, error)) {
            return false;
        }
        const std::string texturePath = projectMTexturePath(widePath);
        if (!texturePath.empty()) {
            const char* texturePaths[] = {texturePath.c_str()};
            setTextureSearchPaths_(handle_, texturePaths, 1);
        }
        presetError_.clear();
        presetFailed_ = false;
        if (transitionSeconds >= 0.0) {
            setSoftCutDuration_(handle_,
                                std::clamp(transitionSeconds, 0.0, 30.0));
        }
        // projectM 4.1.6 opens file paths through a narrow std::ifstream on
        // Windows. The host performs the filesystem operation through
        // CreateFileW and passes the real MilkDrop contents to the public
        // projectm_load_preset_data API, avoiding locale-dependent path loss.
        loadPresetData_(handle_, presetData.data(), smoothTransition);
        if (presetFailed_) {
            error = presetError_.empty() ? "projectM ha rifiutato il preset."
                                         : presetError_;
            return false;
        }
        presetPath_ = path;
        presetPathUtf8Bytes_ = path.size();
        return true;
    }

    bool setPresetLocked(bool locked, std::string& error) {
        if (!handle_) {
            error = "Motore projectM non inizializzato.";
            return false;
        }
        setPresetLocked_(handle_, locked);
        presetLocked_ = locked;
        return true;
    }

    bool step(const StepMeta& meta, const float* samples,
              std::vector<std::uint8_t>& pixels, FrameMeta& frame,
              std::string& error) {
        if (!handle_) {
            error = "Motore projectM non inizializzato.";
            return false;
        }
        if (presetPath_.empty()) {
            error = "Nessun preset projectM caricato.";
            return false;
        }
        if (!meta.width || !meta.height || meta.width > kMaxDimension ||
            meta.height > kMaxDimension) {
            error = "Dimensioni framebuffer projectM non valide.";
            return false;
        }
        if (meta.channels != 1 && meta.channels != 2) {
            error = "Il PCM projectM deve essere mono o stereo.";
            return false;
        }

        if (meta.width != width_ || meta.height != height_) {
            width_ = meta.width;
            height_ = meta.height;
            context_.resize(width_, height_);
            setWindowSize_(handle_, width_, height_);
        }

        const std::uint32_t steps = std::clamp(meta.steps, 1U, 240U);
        const auto started = std::chrono::steady_clock::now();
        using BindFramebuffer = void(APIENTRY*)(GLenum, GLuint);
        const auto bindFramebuffer = reinterpret_cast<BindFramebuffer>(
            wglGetProcAddress("glBindFramebuffer"));
        if (!bindFramebuffer) {
            error = "glBindFramebuffer non disponibile nel contesto OpenGL.";
            return false;
        }
        constexpr GLenum kGlFramebuffer = 0x8D40;
        // projectM usa FBO interni e può lasciarne uno attivo dopo il frame
        // precedente. Il target letto da glReadPixels deve invece essere
        // sempre il backbuffer completo della finestra host.
        bindFramebuffer(kGlFramebuffer, 0);
        glViewport(0, 0, static_cast<GLsizei>(width_),
                   static_cast<GLsizei>(height_));
        glEnable(GL_SCISSOR_TEST);
        glScissor(0, 0, static_cast<GLsizei>(width_),
                  static_cast<GLsizei>(height_));
        glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
        glDepthMask(GL_TRUE);
        glStencilMask(~0U);
        // Alpha 1 distingue pixel neri inizializzati da memoria non scritta.
        glClearColor(0.0F, 0.0F, 0.0F, 1.0F);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT |
                GL_STENCIL_BUFFER_BIT);
        glDisable(GL_SCISSOR_TEST);
        for (std::uint32_t stepIndex = 0; stepIndex < steps; ++stepIndex) {
            const std::uint32_t sampleStart = static_cast<std::uint32_t>(
                (static_cast<std::uint64_t>(meta.sampleCount) * stepIndex) /
                steps);
            const std::uint32_t sampleEnd = static_cast<std::uint32_t>(
                (static_cast<std::uint64_t>(meta.sampleCount) *
                 (stepIndex + 1)) /
                steps);
            std::uint32_t cursor = sampleStart;
            while (cursor < sampleEnd) {
                const std::uint32_t count =
                    std::min(pcmMaxSamples_, sampleEnd - cursor);
                pcmAddFloat_(handle_, samples + cursor * meta.channels, count,
                             static_cast<ProjectMChannels>(meta.channels));
                cursor += count;
            }
            renderFrame_(handle_);
            ++frameIndex_;
        }
        glFinish();

        const std::size_t stride = static_cast<std::size_t>(width_) * 4;
        const std::size_t pixelBytes =
            stride * static_cast<std::size_t>(height_);
        pixels.assign(pixelBytes, 0);
        while (glGetError() != GL_NO_ERROR) {
        }
        bindFramebuffer(kGlFramebuffer, 0);
        glViewport(0, 0, static_cast<GLsizei>(width_),
                   static_cast<GLsizei>(height_));
        glDisable(GL_SCISSOR_TEST);
        glPixelStorei(GL_PACK_ALIGNMENT, 1);
        glPixelStorei(GL_PACK_ROW_LENGTH, 0);
        glPixelStorei(GL_PACK_SKIP_ROWS, 0);
        glPixelStorei(GL_PACK_SKIP_PIXELS, 0);
        glReadBuffer(GL_BACK);
        constexpr GLenum kGlBgra = 0x80E1;
        glReadPixels(0, 0, static_cast<GLsizei>(width_),
                     static_cast<GLsizei>(height_), kGlBgra, GL_UNSIGNED_BYTE,
                     pixels.data());
        const GLenum glError = glGetError();
        if (glError != GL_NO_ERROR) {
            std::ostringstream message;
            message << "glReadPixels ha restituito OpenGL error 0x" << std::hex
                    << glError;
            error = message.str();
            return false;
        }

        rowScratch_.resize(stride);
        for (std::uint32_t row = 0; row < height_ / 2; ++row) {
            auto* top = pixels.data() + static_cast<std::size_t>(row) * stride;
            auto* bottom =
                pixels.data() +
                static_cast<std::size_t>(height_ - row - 1) * stride;
            std::memcpy(rowScratch_.data(), top, stride);
            std::memcpy(top, bottom, stride);
            std::memcpy(bottom, rowScratch_.data(), stride);
        }

        const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(
                                 std::chrono::steady_clock::now() - started)
                                 .count();
        frame = FrameMeta{width_,
                          height_,
                          static_cast<std::uint32_t>(stride),
                          meta.sampleCount,
                          frameIndex_,
                          static_cast<std::uint64_t>(elapsed),
                          steps,
                          0};
        return true;
    }

    std::string statusJson(bool available, const std::string& error) const {
        std::ostringstream json;
        json << "{\"available\":" << (available ? "true" : "false")
             << ",\"running\":" << (handle_ ? "true" : "false")
             << ",\"version\":\"" << versionMajor_ << '.' << versionMinor_
             << '.' << versionPatch_ << "\",\"glRenderer\":\""
             << jsonEscape(context_.renderer()) << "\",\"glVersion\":\""
             << jsonEscape(context_.version()) << "\",\"preset\":\""
             << jsonEscape(presetPath_) << "\",\"error\":\""
             << jsonEscape(error) << "\",\"pid\":" << GetCurrentProcessId()
             << ",\"pcmMaxSamples\":" << pcmMaxSamples_
             << ",\"presetPathUtf8Bytes\":" << presetPathUtf8Bytes_
             << ",\"activeCodePage\":" << GetACP()
             << ",\"protocolVersion\":" << kProtocolVersion
             << ",\"deterministicSeed\":\"" << deterministicSeed_ << "\"}";
        return json.str();
    }

    void close() {
        if (handle_ && destroy_) {
            destroy_(handle_);
            handle_ = nullptr;
        }
        if (library_) {
            FreeLibrary(library_);
            library_ = nullptr;
        }
        context_.close();
        clearFunctions();
        presetPath_.clear();
        pixelsReleased();
        width_ = 0;
        height_ = 0;
        frameIndex_ = 0;
        versionMajor_ = 0;
        versionMinor_ = 0;
        versionPatch_ = 0;
        pcmMaxSamples_ = 0;
        presetFailed_ = false;
        presetLocked_ = false;
        presetError_.clear();
        presetPathUtf8Bytes_ = 0;
        deterministicSeed_ = 0;
    }

  private:
    template <typename Function>
    bool load(Function& target, const char* name, std::string& error) {
        target = reinterpret_cast<Function>(GetProcAddress(library_, name));
        if (!target) {
            error = std::string("Simbolo projectM mancante: ") + name;
            return false;
        }
        return true;
    }

    bool loadFunctions(std::string& error) {
        return load(createWithSeed_, "projectm_create_with_seed", error) &&
               load(destroy_, "projectm_destroy", error) &&
               load(loadPresetData_, "projectm_load_preset_data", error) &&
               load(renderFrame_, "projectm_opengl_render_frame", error) &&
               load(pcmGetMaxSamples_, "projectm_pcm_get_max_samples", error) &&
               load(pcmAddFloat_, "projectm_pcm_add_float", error) &&
               load(setFps_, "projectm_set_fps", error) &&
               load(setWindowSize_, "projectm_set_window_size", error) &&
               load(setAspectCorrection_, "projectm_set_aspect_correction",
                    error) &&
               load(setPresetLocked_, "projectm_set_preset_locked", error) &&
               load(setSoftCutDuration_, "projectm_set_soft_cut_duration",
                    error) &&
               load(getVersionComponents_, "projectm_get_version_components",
                    error) &&
               load(setTextureSearchPaths_,
                    "projectm_set_texture_search_paths", error) &&
               load(setPresetFailedCallback_,
                    "projectm_set_preset_switch_failed_event_callback", error);
    }

    void clearFunctions() {
        createWithSeed_ = nullptr;
        destroy_ = nullptr;
        loadPresetData_ = nullptr;
        renderFrame_ = nullptr;
        pcmGetMaxSamples_ = nullptr;
        pcmAddFloat_ = nullptr;
        setFps_ = nullptr;
        setWindowSize_ = nullptr;
        setAspectCorrection_ = nullptr;
        setPresetLocked_ = nullptr;
        setSoftCutDuration_ = nullptr;
        getVersionComponents_ = nullptr;
        setTextureSearchPaths_ = nullptr;
        setPresetFailedCallback_ = nullptr;
    }

    static void presetFailed(const char* filename, const char* message,
                             void* userData) {
        auto* runtime = static_cast<ProjectMRuntime*>(userData);
        runtime->presetFailed_ = true;
        runtime->presetError_ =
            std::string("Preset non caricato: ") +
            (filename ? filename : "sconosciuto") + " — " +
            (message ? message : "errore projectM");
    }

    void pixelsReleased() { rowScratch_.clear(); }

    WglContext context_;
    HMODULE library_ = nullptr;
    ProjectMHandle handle_ = nullptr;
    ProjectMCreateWithSeed createWithSeed_ = nullptr;
    ProjectMDestroy destroy_ = nullptr;
    ProjectMLoadPresetData loadPresetData_ = nullptr;
    ProjectMRenderFrame renderFrame_ = nullptr;
    ProjectMPcmGetMaxSamples pcmGetMaxSamples_ = nullptr;
    ProjectMPcmAddFloat pcmAddFloat_ = nullptr;
    ProjectMSetFps setFps_ = nullptr;
    ProjectMSetWindowSize setWindowSize_ = nullptr;
    ProjectMSetAspectCorrection setAspectCorrection_ = nullptr;
    ProjectMSetPresetLocked setPresetLocked_ = nullptr;
    ProjectMSetSoftCutDuration setSoftCutDuration_ = nullptr;
    ProjectMGetVersionComponents getVersionComponents_ = nullptr;
    ProjectMSetTextureSearchPaths setTextureSearchPaths_ = nullptr;
    ProjectMSetPresetFailedCallback setPresetFailedCallback_ = nullptr;
    std::uint32_t width_ = 0;
    std::uint32_t height_ = 0;
    std::uint32_t pcmMaxSamples_ = 0;
    std::uint64_t frameIndex_ = 0;
    std::uint64_t deterministicSeed_ = 0;
    int versionMajor_ = 0;
    int versionMinor_ = 0;
    int versionPatch_ = 0;
    bool presetFailed_ = false;
    bool presetLocked_ = false;
    std::string presetError_;
    std::string presetPath_;
    std::size_t presetPathUtf8Bytes_ = 0;
    std::vector<std::uint8_t> rowScratch_;
};

std::filesystem::path moduleDirectory() {
    std::wstring buffer(32768, L'\0');
    const DWORD length =
        GetModuleFileNameW(nullptr, buffer.data(),
                           static_cast<DWORD>(buffer.size()));
    buffer.resize(length);
    return std::filesystem::path(buffer).parent_path();
}

} // namespace

int wmain() {
    SetConsoleOutputCP(CP_UTF8);
    const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    const HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
    if (input == INVALID_HANDLE_VALUE || output == INVALID_HANDLE_VALUE) {
        return 2;
    }
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX |
                 SEM_NOOPENFILEERRORBOX);

    const std::filesystem::path dllPath =
        moduleDirectory() / L"projectM-4.dll";
    ProjectMRuntime runtime;
    std::vector<std::uint8_t> payload;
    std::vector<std::uint8_t> pixels;
    std::uint32_t width = 540;
    std::uint32_t height = 960;

    while (true) {
        PacketHeader header{};
        if (!readExact(input, &header, sizeof(header))) {
            break;
        }
        if (header.magic != kInputMagic ||
            header.version != kProtocolVersion ||
            header.payloadSize > kMaxControlPayload) {
            sendJson(output, OutputType::Error, header.requestId,
                     "{\"error\":\"Pacchetto IPC projectM non valido.\"}");
            break;
        }
        payload.resize(header.payloadSize);
        if (header.payloadSize &&
            !readExact(input, payload.data(), payload.size())) {
            break;
        }

        const auto type = static_cast<InputType>(header.type);
        if (type == InputType::Shutdown) {
            runtime.close();
            sendJson(output, OutputType::Ack, header.requestId,
                     "{\"closed\":true}");
            break;
        }

        if (type == InputType::Ping) {
            sendJson(output, OutputType::Status, header.requestId,
                     runtime.statusJson(true, ""));
            continue;
        }

        if (type == InputType::Initialize) {
            width = header.arg0 ? header.arg0 : 540;
            height = header.arg1 ? header.arg1 : 960;
            if (payload.size() != sizeof(std::uint64_t)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"Protocollo projectM v2: seed uint64 "
                         "little-endian obbligatorio.\"}");
                continue;
            }
            std::uint64_t deterministicSeed = 0;
            std::memcpy(&deterministicSeed, payload.data(),
                        sizeof(deterministicSeed));
            std::string error;
            if (!runtime.initialize(dllPath, width, height, deterministicSeed,
                                    error)) {
                sendJson(output, OutputType::Status, header.requestId,
                         runtime.statusJson(false, error));
            } else {
                sendJson(output, OutputType::Status, header.requestId,
                         runtime.statusJson(true, ""));
            }
            continue;
        }

        if (type == InputType::Reset) {
            width = header.arg0 ? header.arg0 : width;
            height = header.arg1 ? header.arg1 : height;
            if (payload.size() != sizeof(std::uint64_t)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"Protocollo projectM v2: seed uint64 "
                         "little-endian obbligatorio al reset.\"}");
                continue;
            }
            std::uint64_t deterministicSeed = 0;
            std::memcpy(&deterministicSeed, payload.data(),
                        sizeof(deterministicSeed));
            std::string error;
            if (!runtime.reset(dllPath, width, height, deterministicSeed,
                               error)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"" + jsonEscape(error) + "\"}");
            } else {
                sendJson(output, OutputType::Status, header.requestId,
                         runtime.statusJson(true, ""));
            }
            continue;
        }

        if (type == InputType::LoadPreset) {
            const std::string path(
                reinterpret_cast<const char*>(payload.data()), payload.size());
            std::string error;
            const bool smoothTransition = header.arg0 != 0;
            const double transitionSeconds =
                static_cast<double>(header.arg1) / 1000.0;
            if (!runtime.loadPreset(path, smoothTransition,
                                    transitionSeconds, error)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"" + jsonEscape(error) + "\"}");
            } else {
                sendJson(output, OutputType::Status, header.requestId,
                         runtime.statusJson(true, ""));
            }
            continue;
        }

        if (type == InputType::SetPresetLocked) {
            std::string error;
            if (!runtime.setPresetLocked(header.arg0 != 0, error)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"" + jsonEscape(error) + "\"}");
            } else {
                sendJson(output, OutputType::Status, header.requestId,
                         runtime.statusJson(true, ""));
            }
            continue;
        }

        if (type == InputType::Step) {
            if (payload.size() < sizeof(StepMeta)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"Payload PCM projectM incompleto.\"}");
                continue;
            }
            StepMeta meta{};
            std::memcpy(&meta, payload.data(), sizeof(meta));
            const std::uint64_t floats =
                static_cast<std::uint64_t>(meta.sampleCount) * meta.channels;
            const std::uint64_t required =
                sizeof(StepMeta) + floats * sizeof(float);
            if (required != payload.size()) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"Dimensione PCM projectM non valida.\"}");
                continue;
            }
            FrameMeta frame{};
            std::string error;
            const auto* samples = reinterpret_cast<const float*>(
                payload.data() + sizeof(StepMeta));
            if (!runtime.step(meta, samples, pixels, frame, error)) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"" + jsonEscape(error) + "\"}");
                continue;
            }
            const std::uint64_t totalSize =
                sizeof(FrameMeta) + static_cast<std::uint64_t>(pixels.size());
            if (totalSize > UINT32_MAX) {
                sendJson(output, OutputType::Error, header.requestId,
                         "{\"error\":\"Framebuffer projectM troppo grande.\"}");
                continue;
            }
            const PacketHeader frameHeader{
                kOutputMagic,
                kProtocolVersion,
                static_cast<std::uint16_t>(OutputType::Frame),
                header.requestId,
                static_cast<std::uint32_t>(totalSize),
                frame.width,
                frame.height};
            if (!writeExact(output, &frameHeader, sizeof(frameHeader)) ||
                !writeExact(output, &frame, sizeof(frame)) ||
                !writeExact(output, pixels.data(), pixels.size())) {
                break;
            }
            continue;
        }

        sendJson(output, OutputType::Error, header.requestId,
                 "{\"error\":\"Comando projectM non supportato.\"}");
    }

    runtime.close();
    return 0;
}
