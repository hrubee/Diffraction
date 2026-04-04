package ai.diffraction.app.node

import ai.diffraction.app.protocol.DiffractionCalendarCommand
import ai.diffraction.app.protocol.DiffractionCameraCommand
import ai.diffraction.app.protocol.DiffractionCallLogCommand
import ai.diffraction.app.protocol.DiffractionCapability
import ai.diffraction.app.protocol.DiffractionContactsCommand
import ai.diffraction.app.protocol.DiffractionDeviceCommand
import ai.diffraction.app.protocol.DiffractionLocationCommand
import ai.diffraction.app.protocol.DiffractionMotionCommand
import ai.diffraction.app.protocol.DiffractionNotificationsCommand
import ai.diffraction.app.protocol.DiffractionPhotosCommand
import ai.diffraction.app.protocol.DiffractionSmsCommand
import ai.diffraction.app.protocol.DiffractionSystemCommand
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      DiffractionCapability.Canvas.rawValue,
      DiffractionCapability.Device.rawValue,
      DiffractionCapability.Notifications.rawValue,
      DiffractionCapability.System.rawValue,
      DiffractionCapability.Photos.rawValue,
      DiffractionCapability.Contacts.rawValue,
      DiffractionCapability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      DiffractionCapability.Camera.rawValue,
      DiffractionCapability.Location.rawValue,
      DiffractionCapability.Sms.rawValue,
      DiffractionCapability.CallLog.rawValue,
      DiffractionCapability.VoiceWake.rawValue,
      DiffractionCapability.Motion.rawValue,
    )

  private val coreCommands =
    setOf(
      DiffractionDeviceCommand.Status.rawValue,
      DiffractionDeviceCommand.Info.rawValue,
      DiffractionDeviceCommand.Permissions.rawValue,
      DiffractionDeviceCommand.Health.rawValue,
      DiffractionNotificationsCommand.List.rawValue,
      DiffractionNotificationsCommand.Actions.rawValue,
      DiffractionSystemCommand.Notify.rawValue,
      DiffractionPhotosCommand.Latest.rawValue,
      DiffractionContactsCommand.Search.rawValue,
      DiffractionContactsCommand.Add.rawValue,
      DiffractionCalendarCommand.Events.rawValue,
      DiffractionCalendarCommand.Add.rawValue,
    )

  private val optionalCommands =
    setOf(
      DiffractionCameraCommand.Snap.rawValue,
      DiffractionCameraCommand.Clip.rawValue,
      DiffractionCameraCommand.List.rawValue,
      DiffractionLocationCommand.Get.rawValue,
      DiffractionMotionCommand.Activity.rawValue,
      DiffractionMotionCommand.Pedometer.rawValue,
      DiffractionSmsCommand.Send.rawValue,
      DiffractionSmsCommand.Search.rawValue,
      DiffractionCallLogCommand.Search.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          callLogAvailable = true,
          voiceWakeEnabled = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          callLogAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          sendSmsAvailable = false,
          readSmsAvailable = false,
          callLogAvailable = false,
          voiceWakeEnabled = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(DiffractionMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(DiffractionMotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCommands.contains(DiffractionSmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(DiffractionSmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(DiffractionSmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(DiffractionSmsCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_includeSmsWhenEitherSmsPathIsAvailable() {
    val readOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCapabilities.contains(DiffractionCapability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(DiffractionCapability.Sms.rawValue))
  }

  @Test
  fun advertisedCommands_excludesCallLogWhenUnavailable() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(callLogAvailable = false))

    assertFalse(commands.contains(DiffractionCallLogCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_excludesCallLogWhenUnavailable() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(callLogAvailable = false))

    assertFalse(capabilities.contains(DiffractionCapability.CallLog.rawValue))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    callLogAvailable: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    debugBuild: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      callLogAvailable = callLogAvailable,
      voiceWakeEnabled = voiceWakeEnabled,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      debugBuild = debugBuild,
    )

  private fun assertContainsAll(actual: List<String>, expected: Set<String>) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(actual: List<String>, forbidden: Set<String>) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
