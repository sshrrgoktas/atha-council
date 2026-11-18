import XCTest
@testable import AthaCouncil

final class CouncilEndpointTests: XCTestCase {
    func testOfficialOnly() {
        XCTAssertTrue(CouncilEndpoint.official(CouncilEndpoint.conversation))
        XCTAssertTrue(CouncilEndpoint.official(CouncilEndpoint.status))
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
            XCTAssertFalse(CouncilEndpoint.official(URL(string: value)!), value)
        }
    }
    func testStatusJSON() throws {
        let status = try JSONDecoder().decode(CouncilServiceStatus.self,
            from: Data(#"{"ready":true,"ai":true}"#.utf8))
        XCTAssertTrue(status.ready)
    }
}
