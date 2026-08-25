#include "PresetTransition.hpp"

#include "DeterministicState.hpp"
#include "TextureManager.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>

namespace libprojectM {
namespace Renderer {

constexpr double PI = 3.14159265358979323846;

PresetTransition::PresetTransition(const std::shared_ptr<Shader>& transitionShader,
                                   double durationSeconds,
                                   bool deterministic)
    : m_transitionShader(transitionShader)
    , m_durationSeconds(durationSeconds)
    , m_deterministic(deterministic)
    , m_randomGenerator(DeterministicState::NextSeed32())
{
    m_staticRandomValues = {m_randomGenerator(), m_randomGenerator(),
                            m_randomGenerator(), m_randomGenerator()};

    RenderItem::Init();
}

void PresetTransition::InitVertexAttrib()
{
    static const std::array<RenderItem::Point, 4> points{{{-1.0f, 1.0f},
                                                          {1.0f, 1.0f},
                                                          {-1.0f, -1.0f},
                                                          {1.0f, -1.0f}}};

    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, sizeof(Point), reinterpret_cast<void*>(offsetof(Point, x))); // Position
    glBufferData(GL_ARRAY_BUFFER, sizeof(points), points.data(), GL_STATIC_DRAW);
}

auto PresetTransition::IsDone() const -> bool
{
    const auto secondsSinceStart =
        m_deterministic
            ? m_elapsedSeconds
            : std::chrono::duration<double>(
                  std::chrono::system_clock::now() - m_transitionStartTime)
                  .count();
    return m_durationSeconds <= 0.0 || secondsSinceStart >= m_durationSeconds;
}

void PresetTransition::Draw(const Preset& oldPreset,
                            const Preset& newPreset,
                            const RenderContext& context,
                            const libprojectM::Audio::FrameAudioData& audioData)
{
    using namespace std::chrono_literals;

    if (m_transitionShader == nullptr)
    {
        return;
    }

    // Calculate progress values
    const auto now = std::chrono::system_clock::now();
    const auto frameDelta = m_deterministic
                                ? 1.0 / static_cast<double>(std::max(1.0f, context.fps))
                                : std::chrono::duration<double>(now - m_lastFrameTime).count();
    const auto secondsSinceStart =
        m_deterministic
            ? m_elapsedSeconds
            : std::chrono::duration<double>(now - m_transitionStartTime).count();

    // If duration is zero,
    double linearProgress{1.0};
    double cosineProgress{1.0};
    double bicubicProgress{1.0};

    if (m_durationSeconds > 0.0)
    {
        linearProgress = secondsSinceStart / m_durationSeconds;
        cosineProgress = (-std::cos(linearProgress * PI) + 1.0) * 0.5;
        bicubicProgress = linearProgress < 0.5 ? 4.0 * linearProgress * linearProgress * linearProgress : 1.0 - pow(-2.0 * linearProgress + 2.0, 3.0) / 2.0;
    }

    m_transitionShader->Bind();

    // Numerical parameters
    m_transitionShader->SetUniformFloat3("iResolution", {static_cast<float>(context.viewportSizeX),
                                                         static_cast<float>(context.viewportSizeY),
                                                         0.0f});

    m_transitionShader->SetUniformFloat4("durationParams", {linearProgress,
                                                            cosineProgress,
                                                            bicubicProgress,
                                                            m_durationSeconds});

    m_transitionShader->SetUniformFloat2(
        "timeParams",
        {static_cast<float>(secondsSinceStart), static_cast<float>(frameDelta)});

    m_transitionShader->SetUniformInt4("iRandStatic", m_staticRandomValues);

    m_transitionShader->SetUniformInt4(
        "iRandFrame",
        {m_randomGenerator(), m_randomGenerator(), m_randomGenerator(),
         m_randomGenerator()});

    m_transitionShader->SetUniformFloat3("iBeatValues", {audioData.bass,
                                                         audioData.mid,
                                                         audioData.treb});

    m_transitionShader->SetUniformFloat3("iBeatAttValues", {audioData.bassAtt,
                                                            audioData.midAtt,
                                                            audioData.trebAtt});

    // Texture samplers
    m_transitionShader->SetUniformInt("iChannel0", 0);
    oldPreset.OutputTexture()->Bind(0, m_presetSampler);
    m_transitionShader->SetUniformInt("iChannel1", 1);
    newPreset.OutputTexture()->Bind(1, m_presetSampler);

    int textureUnit = 2;
    std::vector<TextureSamplerDescriptor> noiseDescriptors(m_noiseTextureNames.size());
    for (const auto& noiseTextureName : m_noiseTextureNames)
    {
        noiseDescriptors[textureUnit - 2] = context.textureManager->GetTexture(noiseTextureName);
        noiseDescriptors[textureUnit - 2].Bind(textureUnit, *m_transitionShader);
        textureUnit++;
    }

    // Render the transition quad
    glBindVertexArray(m_vaoID);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    glBindVertexArray(0);

    // Clean up
    oldPreset.OutputTexture()->Unbind(0);
    newPreset.OutputTexture()->Unbind(1);

    for (int i = 2; i < textureUnit; i++)
    {
        noiseDescriptors[i - 2].Unbind(textureUnit);
    }

    Shader::Unbind();

    // Update last frame time.
    if (m_deterministic)
    {
        m_elapsedSeconds += frameDelta;
    }
    else
    {
        m_lastFrameTime = now;
    }
}

} // namespace Renderer
} // namespace libprojectM
