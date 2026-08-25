cmake_minimum_required(VERSION 3.24)

project(projectm-host VERSION 1.0.0 LANGUAGES CXX)

add_executable(projectm-host WIN32
  src/main.cpp
)

target_compile_features(projectm-host PRIVATE cxx_std_20)
target_compile_definitions(projectm-host PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)

if(MSVC)
  target_compile_options(projectm-host PRIVATE /W4 /permissive- /EHsc /utf-8)
  target_link_options(projectm-host PRIVATE
    /SUBSYSTEM:CONSOLE
    /MANIFEST:EMBED
    "/MANIFESTINPUT:${CMAKE_CURRENT_SOURCE_DIR}/projectm-host.manifest"
  )
endif()

target_link_libraries(projectm-host PRIVATE
  opengl32
  user32
  gdi32
)

install(TARGETS projectm-host RUNTIME DESTINATION .)
