import Foundation

var successes = 0
func check(_ value: Bool) { if value { successes += 1 } else { fputs("Council URL check failed\n", stderr); exit(1) } }
check(CouncilEndpoint.official(CouncilEndpoint.conversation))
check(CouncilEndpoint.official(CouncilEndpoint.status))
for value in [
    "https://atlas-council.sshrrgoktas.workers.dev.evil.example/council-v2",
    "http://atlas-council.sshrrgoktas.workers.dev/council-v2",
    "https://user@atlas-council.sshrrgoktas.workers.dev/council-v2",
    "https://athalai-mobile.sshrrgoktas.workers.dev/",
    "https://atlas-council.sshrrgoktas.workers.dev:8443/council-v2",
    "https://atlas-council.sshrrgoktas.workers.dev/council-v2?ticket=secret",
    "https://atlas-council.sshrrgoktas.workers.dev/council-v2#pair=secret",
    "https://atlas-council.sshrrgoktas.workers.dev/api/atha-tasks"
] {
    check(!CouncilEndpoint.official(URL(string: value)!))
}
let json = Data(#"{"ready":true}"#.utf8)
check((try JSONDecoder().decode(CouncilServiceStatus.self, from: json)).ready)
print("Council URL and JSON checks: \(successes) passed")
