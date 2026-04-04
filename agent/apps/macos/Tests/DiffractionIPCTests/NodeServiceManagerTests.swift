import Foundation
import Testing
@testable import Diffraction

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() throws {
        let tmp = try makeTempDirForTests()
        CommandResolver.setProjectRoot(tmp.path)

        let diffractionPath = tmp.appendingPathComponent("node_modules/.bin/diffraction")
        try makeExecutableForTests(at: diffractionPath)

        let start = NodeServiceManager._testServiceCommand(["start"])
        #expect(start == [diffractionPath.path, "node", "start", "--json"])

        let stop = NodeServiceManager._testServiceCommand(["stop"])
        #expect(stop == [diffractionPath.path, "node", "stop", "--json"])
    }
}
