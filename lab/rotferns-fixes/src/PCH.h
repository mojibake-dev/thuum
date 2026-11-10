#pragma once
// The plugin's precompiled header, forced into every source of the target, the generated plugin-info
// file included: CommonLib's add_commonlibsse_plugin writes `.Name = "..."sv` at global scope
// (cmake/CommonLibSSE.cmake), which needs std::literals there (the first build, job 19497: C3688).
#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>

using namespace std::literals;
