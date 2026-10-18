#pragma once
#if !defined(_WIN32)
#include <httplib.h>
#endif
#include <optional>
#include <string>

namespace Soundux
{
    namespace Objects
    {
        struct VersionStatus
        {
            std::string current;
            std::string latest;
            bool outdated;
        };
    } // namespace Objects
} // namespace Soundux

class VersionCheck
{
#if !defined(_WIN32)
    static httplib::Client client;
#endif

  public:
    static std::optional<Soundux::Objects::VersionStatus> getStatus();
};
