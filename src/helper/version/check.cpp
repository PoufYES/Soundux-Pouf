#include "check.hpp"
#include <fancy.hpp>
#include <json.hpp>
#include <optional>
#include <semver.hpp>
#if defined(_WIN32)
#include <windows.h>
#include <winhttp.h>
#include <memory>
namespace {
struct CloseHttp { void operator()(void *handle) const { if(handle) WinHttpCloseHandle(handle); } };
using HttpHandle = std::unique_ptr<void, CloseHttp>;
std::optional<std::string> fetchTags() {
    HttpHandle session(WinHttpOpen(L"Soundux/0.2.8", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nullptr, nullptr, 0));
    if(!session) return std::nullopt;
    WinHttpSetTimeouts(session.get(), 5000, 5000, 5000, 5000);
    HttpHandle connection(WinHttpConnect(session.get(), L"api.github.com", INTERNET_DEFAULT_HTTPS_PORT, 0));
    if(!connection) return std::nullopt;
    HttpHandle request(WinHttpOpenRequest(connection.get(), L"GET", L"/repos/Soundux/Soundux/tags", nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE));
    if(!request || !WinHttpSendRequest(request.get(), WINHTTP_NO_ADDITIONAL_HEADERS, 0, nullptr, 0, 0, 0) || !WinHttpReceiveResponse(request.get(), nullptr)) return std::nullopt;
    DWORD status=0, size=sizeof(status);
    if(!WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX) || status!=200) return std::nullopt;
    std::string body; char buffer[8192]; DWORD count=0;
    do { if(!WinHttpReadData(request.get(), buffer, sizeof(buffer), &count)) return std::nullopt; body.append(buffer, count); } while(count);
    return body;
}
}
#else

httplib::Client VersionCheck::client("https://api.github.com");
#endif

std::optional<Soundux::Objects::VersionStatus> VersionCheck::getStatus()
{
 #if defined(_WIN32)
    auto githubTags = fetchTags();
    if (githubTags)
    {
        auto parsed = nlohmann::json::parse(*githubTags, nullptr, false);
 #else
    auto githubTags = client.Get("/repos/Soundux/Soundux/tags");

    if (githubTags && githubTags->status == 200)
    {
        auto parsed = nlohmann::json::parse(githubTags->body, nullptr, false);
 #endif

        if (!parsed.is_discarded())
        {
            auto latestTag = parsed[0]["name"];
            if (!latestTag.is_null())
            {
                auto latestTagStr = latestTag.get<std::string>();

                try
                {
                    auto remote = semver::from_string(latestTagStr);
                    auto local = semver::from_string(SOUNDUX_VERSION);

                    return Soundux::Objects::VersionStatus{SOUNDUX_VERSION, latestTagStr, remote > local};
                }
                catch (const std::exception &e)
                {
                    Fancy::fancy.logTime().warning() << "Could not fetch version" << std::endl;
                }
            }
            Fancy::fancy.logTime().warning() << "Failed to find latest tag" << std::endl;
        }
        else
        {
            Fancy::fancy.logTime().warning() << "Failed to parse github response" << std::endl;
        }
    }
    else
    {
        Fancy::fancy.logTime().warning() << "Request failed!" << std::endl;
    }
    return std::nullopt;
}
