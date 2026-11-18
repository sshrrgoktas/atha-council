import Foundation

enum CouncilEndpoint {
    static let host = "atlas-council.sshrrgoktas.workers.dev"
    static let conversation = URL(string: "https://atlas-council.sshrrgoktas.workers.dev/council-v2")!
    static let status = URL(string: "https://atlas-council.sshrrgoktas.workers.dev/api/status")!

    static func official(_ url: URL) -> Bool {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme?.lowercased() == "https", c.host?.lowercased() == host,
              c.port == nil || c.port == 443,
              c.user == nil, c.password == nil, c.fragment == nil, c.query == nil,
              !url.absoluteString.contains("\\") else { return false }
        return c.path == "/council-v2" || c.path == "/api/status"
    }
}

struct CouncilServiceStatus: Decodable { let ready: Bool }
