package ai.diffraction.app.node

import ai.diffraction.app.protocol.DiffractionCalendarCommand
import ai.diffraction.app.protocol.DiffractionCanvasA2UICommand
import ai.diffraction.app.protocol.DiffractionCanvasCommand
import ai.diffraction.app.protocol.DiffractionCameraCommand
import ai.diffraction.app.protocol.DiffractionCapability
import ai.diffraction.app.protocol.DiffractionCallLogCommand
import ai.diffraction.app.protocol.DiffractionContactsCommand
import ai.diffraction.app.protocol.DiffractionDeviceCommand
import ai.diffraction.app.protocol.DiffractionLocationCommand
import ai.diffraction.app.protocol.DiffractionMotionCommand
import ai.diffraction.app.protocol.DiffractionNotificationsCommand
import ai.diffraction.app.protocol.DiffractionPhotosCommand
import ai.diffraction.app.protocol.DiffractionSmsCommand
import ai.diffraction.app.protocol.DiffractionSystemCommand

data class NodeRuntimeFlags(
  val cameraEnabled: Boolean,
  val locationEnabled: Boolean,
  val sendSmsAvailable: Boolean,
  val readSmsAvailable: Boolean,
  val callLogAvailable: Boolean,
  val voiceWakeEnabled: Boolean,
  val motionActivityAvailable: Boolean,
  val motionPedometerAvailable: Boolean,
  val debugBuild: Boolean,
)

enum class InvokeCommandAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SendSmsAvailable,
  ReadSmsAvailable,
  CallLogAvailable,
  MotionActivityAvailable,
  MotionPedometerAvailable,
  DebugBuild,
}

enum class NodeCapabilityAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  CallLogAvailable,
  VoiceWakeEnabled,
  MotionAvailable,
}

data class NodeCapabilitySpec(
  val name: String,
  val availability: NodeCapabilityAvailability = NodeCapabilityAvailability.Always,
)

data class InvokeCommandSpec(
  val name: String,
  val requiresForeground: Boolean = false,
  val availability: InvokeCommandAvailability = InvokeCommandAvailability.Always,
)

object InvokeCommandRegistry {
  val capabilityManifest: List<NodeCapabilitySpec> =
    listOf(
      NodeCapabilitySpec(name = DiffractionCapability.Canvas.rawValue),
      NodeCapabilitySpec(name = DiffractionCapability.Device.rawValue),
      NodeCapabilitySpec(name = DiffractionCapability.Notifications.rawValue),
      NodeCapabilitySpec(name = DiffractionCapability.System.rawValue),
      NodeCapabilitySpec(
        name = DiffractionCapability.Camera.rawValue,
        availability = NodeCapabilityAvailability.CameraEnabled,
      ),
      NodeCapabilitySpec(
        name = DiffractionCapability.Sms.rawValue,
        availability = NodeCapabilityAvailability.SmsAvailable,
      ),
      NodeCapabilitySpec(
        name = DiffractionCapability.VoiceWake.rawValue,
        availability = NodeCapabilityAvailability.VoiceWakeEnabled,
      ),
      NodeCapabilitySpec(
        name = DiffractionCapability.Location.rawValue,
        availability = NodeCapabilityAvailability.LocationEnabled,
      ),
      NodeCapabilitySpec(name = DiffractionCapability.Photos.rawValue),
      NodeCapabilitySpec(name = DiffractionCapability.Contacts.rawValue),
      NodeCapabilitySpec(name = DiffractionCapability.Calendar.rawValue),
      NodeCapabilitySpec(
        name = DiffractionCapability.Motion.rawValue,
        availability = NodeCapabilityAvailability.MotionAvailable,
      ),
      NodeCapabilitySpec(
        name = DiffractionCapability.CallLog.rawValue,
        availability = NodeCapabilityAvailability.CallLogAvailable,
      ),
    )

  val all: List<InvokeCommandSpec> =
    listOf(
      InvokeCommandSpec(
        name = DiffractionCanvasCommand.Present.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasCommand.Hide.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasCommand.Navigate.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasCommand.Eval.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasCommand.Snapshot.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasA2UICommand.Push.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasA2UICommand.PushJSONL.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionCanvasA2UICommand.Reset.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = DiffractionSystemCommand.Notify.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionCameraCommand.List.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = DiffractionCameraCommand.Snap.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = DiffractionCameraCommand.Clip.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = DiffractionLocationCommand.Get.rawValue,
        availability = InvokeCommandAvailability.LocationEnabled,
      ),
      InvokeCommandSpec(
        name = DiffractionDeviceCommand.Status.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionDeviceCommand.Info.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionDeviceCommand.Permissions.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionDeviceCommand.Health.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionNotificationsCommand.List.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionNotificationsCommand.Actions.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionPhotosCommand.Latest.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionContactsCommand.Search.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionContactsCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionCalendarCommand.Events.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionCalendarCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = DiffractionMotionCommand.Activity.rawValue,
        availability = InvokeCommandAvailability.MotionActivityAvailable,
      ),
      InvokeCommandSpec(
        name = DiffractionMotionCommand.Pedometer.rawValue,
        availability = InvokeCommandAvailability.MotionPedometerAvailable,
      ),
      InvokeCommandSpec(
        name = DiffractionSmsCommand.Send.rawValue,
        availability = InvokeCommandAvailability.SendSmsAvailable,
      ),
      InvokeCommandSpec(
        name = DiffractionSmsCommand.Search.rawValue,
        availability = InvokeCommandAvailability.ReadSmsAvailable,
      ),
      InvokeCommandSpec(
        name = DiffractionCallLogCommand.Search.rawValue,
        availability = InvokeCommandAvailability.CallLogAvailable,
      ),
      InvokeCommandSpec(
        name = "debug.logs",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
      InvokeCommandSpec(
        name = "debug.ed25519",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
    )

  private val byNameInternal: Map<String, InvokeCommandSpec> = all.associateBy { it.name }

  fun find(command: String): InvokeCommandSpec? = byNameInternal[command]

  fun advertisedCapabilities(flags: NodeRuntimeFlags): List<String> {
    return capabilityManifest
      .filter { spec ->
        when (spec.availability) {
          NodeCapabilityAvailability.Always -> true
          NodeCapabilityAvailability.CameraEnabled -> flags.cameraEnabled
          NodeCapabilityAvailability.LocationEnabled -> flags.locationEnabled
          NodeCapabilityAvailability.SmsAvailable -> flags.sendSmsAvailable || flags.readSmsAvailable
          NodeCapabilityAvailability.CallLogAvailable -> flags.callLogAvailable
          NodeCapabilityAvailability.VoiceWakeEnabled -> flags.voiceWakeEnabled
          NodeCapabilityAvailability.MotionAvailable -> flags.motionActivityAvailable || flags.motionPedometerAvailable
        }
      }
      .map { it.name }
  }

  fun advertisedCommands(flags: NodeRuntimeFlags): List<String> {
    return all
      .filter { spec ->
        when (spec.availability) {
          InvokeCommandAvailability.Always -> true
          InvokeCommandAvailability.CameraEnabled -> flags.cameraEnabled
          InvokeCommandAvailability.LocationEnabled -> flags.locationEnabled
          InvokeCommandAvailability.SendSmsAvailable -> flags.sendSmsAvailable
          InvokeCommandAvailability.ReadSmsAvailable -> flags.readSmsAvailable
          InvokeCommandAvailability.CallLogAvailable -> flags.callLogAvailable
          InvokeCommandAvailability.MotionActivityAvailable -> flags.motionActivityAvailable
          InvokeCommandAvailability.MotionPedometerAvailable -> flags.motionPedometerAvailable
          InvokeCommandAvailability.DebugBuild -> flags.debugBuild
        }
      }
      .map { it.name }
  }
}
