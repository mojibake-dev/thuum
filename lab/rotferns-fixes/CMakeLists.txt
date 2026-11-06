# Rotfern's Fixes: one SKSE plugin for the engine bugs the lab reads and Eli
# decides to fix for every player (Eli, 2026-11-06: "let's create a patch called
# rotferns fixes that will contain anything we need like that") (docs/research/terrain-upgrade-crash.md is the
# first and, so far, the only one). Built over the repo's CommonLibSSE-NG
# submodule for the 1.6.1170 runtime alone; each fix checks the runtime and the
# bytes at its site before writing and logs installed / wrong runtime / bytes
# mismatch, so a later runtime refuses cleanly instead of patching the wrong code.
#
# Build (sky-build 720, the fork's client-build toolchain: VS 2022 Build Tools,
# CMake, vcpkg in manifest mode; README.md has the exact lines):
#   cmake -B build -G "Visual Studio 17 2022" -A x64 \
#     -DCMAKE_TOOLCHAIN_FILE=<vcpkg>/scripts/buildsystems/vcpkg.cmake \
#     -DVCPKG_TARGET_TRIPLET=x64-windows-static-md
#   cmake --build build --config Release
#   cmake --install build --config Release --prefix dist   # dist/SKSE/Plugins/RotfernsFixes.dll (+ .pdb)
cmake_minimum_required(VERSION 3.24)

# the fork's fmt pin (skymp overlay_ports/fmt, 11.2.0, copied here): the pairing with this CommonLib commit the fork builds
set(VCPKG_OVERLAY_PORTS "${CMAKE_CURRENT_SOURCE_DIR}/overlay_ports" CACHE STRING "")

if(NOT DEFINED VCPKG_TARGET_TRIPLET)
    # spdlog and fmt static, the CRT dynamic: the DLL carries no runtime DLLs of its own into Data/SKSE/Plugins
    set(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE)
endif()

project(RotfernsFixes VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>DLL")
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELEASE ON)

# the submodule at the repo root, AE only (the lab's runtime is 1.6.1170, ADR-022), with Xbyak for the trampoline
set(ENABLE_SKYRIM_SE OFF CACHE BOOL "" FORCE)
set(ENABLE_SKYRIM_AE ON CACHE BOOL "" FORCE)
set(ENABLE_SKYRIM_VR OFF CACHE BOOL "" FORCE)
set(SKSE_SUPPORT_XBYAK ON CACHE BOOL "" FORCE)
set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(COMMONLIBSSE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../CommonLibSSE-NG")
add_subdirectory("${COMMONLIBSSE_DIR}" CommonLibSSE EXCLUDE_FROM_ALL)
include("${COMMONLIBSSE_DIR}/cmake/CommonLibSSE.cmake")

find_package(xbyak CONFIG REQUIRED)

# the generated plugin block (SKSEPlugin_Version, SKSEPlugin_Query) comes from this call: name, version,
# author, Address Library compatibility and the SKSE floor; src/main.cpp defines SKSEPlugin_Load alone
add_commonlibsse_plugin(${PROJECT_NAME}
    NAME "Rotfern's Fixes"
    AUTHOR "thuum"
    VERSION ${PROJECT_VERSION}
    MINIMUM_SKSE_VERSION 2.2.6
    USE_ADDRESS_LIBRARY
    SOURCES src/main.cpp)
target_link_libraries(${PROJECT_NAME} PRIVATE xbyak::xbyak)
target_precompile_headers(${PROJECT_NAME} PRIVATE <RE/Skyrim.h> <SKSE/SKSE.h>)
target_compile_options(${PROJECT_NAME} PRIVATE /W4 /permissive- /Zc:preprocessor /utf-8 $<$<CONFIG:Release>:/Zi>)
# a PDB in Release too: Crash Logger reads it beside the DLL
target_link_options(${PROJECT_NAME} PRIVATE $<$<CONFIG:Release>:/DEBUG /OPT:REF /OPT:ICF>)
set_target_properties(${PROJECT_NAME} PROPERTIES OUTPUT_NAME "RotfernsFixes")

install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION "SKSE/Plugins")
install(FILES "$<TARGET_PDB_FILE:${PROJECT_NAME}>" DESTINATION "SKSE/Plugins" OPTIONAL)
