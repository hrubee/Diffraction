import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-diffraction writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.diffraction.mac"
let gatewayLaunchdLabel = "ai.diffraction.gateway"
let onboardingVersionKey = "diffraction.onboardingVersion"
let onboardingSeenKey = "diffraction.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "diffraction.pauseEnabled"
let iconAnimationsEnabledKey = "diffraction.iconAnimationsEnabled"
let swabbleEnabledKey = "diffraction.swabbleEnabled"
let swabbleTriggersKey = "diffraction.swabbleTriggers"
let voiceWakeTriggerChimeKey = "diffraction.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "diffraction.voiceWakeSendChime"
let showDockIconKey = "diffraction.showDockIcon"
let defaultVoiceWakeTriggers = ["diffraction"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "diffraction.voiceWakeMicID"
let voiceWakeMicNameKey = "diffraction.voiceWakeMicName"
let voiceWakeLocaleKey = "diffraction.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "diffraction.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "diffraction.voicePushToTalkEnabled"
let talkEnabledKey = "diffraction.talkEnabled"
let iconOverrideKey = "diffraction.iconOverride"
let connectionModeKey = "diffraction.connectionMode"
let remoteTargetKey = "diffraction.remoteTarget"
let remoteIdentityKey = "diffraction.remoteIdentity"
let remoteProjectRootKey = "diffraction.remoteProjectRoot"
let remoteCliPathKey = "diffraction.remoteCliPath"
let canvasEnabledKey = "diffraction.canvasEnabled"
let cameraEnabledKey = "diffraction.cameraEnabled"
let systemRunPolicyKey = "diffraction.systemRunPolicy"
let systemRunAllowlistKey = "diffraction.systemRunAllowlist"
let systemRunEnabledKey = "diffraction.systemRunEnabled"
let locationModeKey = "diffraction.locationMode"
let locationPreciseKey = "diffraction.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "diffraction.peekabooBridgeEnabled"
let deepLinkKeyKey = "diffraction.deepLinkKey"
let modelCatalogPathKey = "diffraction.modelCatalogPath"
let modelCatalogReloadKey = "diffraction.modelCatalogReload"
let cliInstallPromptedVersionKey = "diffraction.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "diffraction.heartbeatsEnabled"
let debugPaneEnabledKey = "diffraction.debugPaneEnabled"
let debugFileLogEnabledKey = "diffraction.debug.fileLogEnabled"
let appLogLevelKey = "diffraction.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
