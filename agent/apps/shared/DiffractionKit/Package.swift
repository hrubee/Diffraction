// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "DiffractionKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "DiffractionProtocol", targets: ["DiffractionProtocol"]),
        .library(name: "DiffractionKit", targets: ["DiffractionKit"]),
        .library(name: "DiffractionChatUI", targets: ["DiffractionChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "DiffractionProtocol",
            path: "Sources/DiffractionProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "DiffractionKit",
            dependencies: [
                "DiffractionProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/DiffractionKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "DiffractionChatUI",
            dependencies: [
                "DiffractionKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/DiffractionChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "DiffractionKitTests",
            dependencies: ["DiffractionKit", "DiffractionChatUI"],
            path: "Tests/DiffractionKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
