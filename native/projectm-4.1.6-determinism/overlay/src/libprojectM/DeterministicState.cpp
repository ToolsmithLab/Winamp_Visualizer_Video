#include "DeterministicState.hpp"

#include <cstdlib>

extern "C" void prjm_eval_set_random_seed(uint32_t seed);

namespace libprojectM {
namespace DeterministicState {
namespace {

uint64_t g_seed{0};
uint64_t g_state{0};
bool g_enabled{false};

auto Next64() -> uint64_t
{
    uint64_t value = (g_state += UINT64_C(0x9E3779B97F4A7C15));
    value = (value ^ (value >> 30U)) * UINT64_C(0xBF58476D1CE4E5B9);
    value = (value ^ (value >> 27U)) * UINT64_C(0x94D049BB133111EB);
    return value ^ (value >> 31U);
}

} // namespace

void Configure(uint64_t seed, bool deterministic)
{
    g_seed = seed;
    g_state = seed;
    g_enabled = deterministic;
    const auto seed32 = static_cast<uint32_t>(Next64());
    std::srand(seed32);
    prjm_eval_set_random_seed(seed32 ^ UINT32_C(0x4141F00D));
}

auto Enabled() -> bool
{
    return g_enabled;
}

auto Seed() -> uint64_t
{
    return g_seed;
}

auto NextSeed32() -> uint32_t
{
    return static_cast<uint32_t>(Next64());
}

} // namespace DeterministicState
} // namespace libprojectM
