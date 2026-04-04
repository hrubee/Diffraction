package ai.diffraction.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class DiffractionProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", DiffractionCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", DiffractionCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", DiffractionCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", DiffractionCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", DiffractionCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", DiffractionCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", DiffractionCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", DiffractionCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", DiffractionCapability.Canvas.rawValue)
    assertEquals("camera", DiffractionCapability.Camera.rawValue)
    assertEquals("voiceWake", DiffractionCapability.VoiceWake.rawValue)
    assertEquals("location", DiffractionCapability.Location.rawValue)
    assertEquals("sms", DiffractionCapability.Sms.rawValue)
    assertEquals("device", DiffractionCapability.Device.rawValue)
    assertEquals("notifications", DiffractionCapability.Notifications.rawValue)
    assertEquals("system", DiffractionCapability.System.rawValue)
    assertEquals("photos", DiffractionCapability.Photos.rawValue)
    assertEquals("contacts", DiffractionCapability.Contacts.rawValue)
    assertEquals("calendar", DiffractionCapability.Calendar.rawValue)
    assertEquals("motion", DiffractionCapability.Motion.rawValue)
    assertEquals("callLog", DiffractionCapability.CallLog.rawValue)
  }

  @Test
  fun cameraCommandsUseStableStrings() {
    assertEquals("camera.list", DiffractionCameraCommand.List.rawValue)
    assertEquals("camera.snap", DiffractionCameraCommand.Snap.rawValue)
    assertEquals("camera.clip", DiffractionCameraCommand.Clip.rawValue)
  }

  @Test
  fun notificationsCommandsUseStableStrings() {
    assertEquals("notifications.list", DiffractionNotificationsCommand.List.rawValue)
    assertEquals("notifications.actions", DiffractionNotificationsCommand.Actions.rawValue)
  }

  @Test
  fun deviceCommandsUseStableStrings() {
    assertEquals("device.status", DiffractionDeviceCommand.Status.rawValue)
    assertEquals("device.info", DiffractionDeviceCommand.Info.rawValue)
    assertEquals("device.permissions", DiffractionDeviceCommand.Permissions.rawValue)
    assertEquals("device.health", DiffractionDeviceCommand.Health.rawValue)
  }

  @Test
  fun systemCommandsUseStableStrings() {
    assertEquals("system.notify", DiffractionSystemCommand.Notify.rawValue)
  }

  @Test
  fun photosCommandsUseStableStrings() {
    assertEquals("photos.latest", DiffractionPhotosCommand.Latest.rawValue)
  }

  @Test
  fun contactsCommandsUseStableStrings() {
    assertEquals("contacts.search", DiffractionContactsCommand.Search.rawValue)
    assertEquals("contacts.add", DiffractionContactsCommand.Add.rawValue)
  }

  @Test
  fun calendarCommandsUseStableStrings() {
    assertEquals("calendar.events", DiffractionCalendarCommand.Events.rawValue)
    assertEquals("calendar.add", DiffractionCalendarCommand.Add.rawValue)
  }

  @Test
  fun motionCommandsUseStableStrings() {
    assertEquals("motion.activity", DiffractionMotionCommand.Activity.rawValue)
    assertEquals("motion.pedometer", DiffractionMotionCommand.Pedometer.rawValue)
  }

  @Test
  fun callLogCommandsUseStableStrings() {
    assertEquals("callLog.search", DiffractionCallLogCommand.Search.rawValue)
  }

  @Test
  fun smsCommandsUseStableStrings() {
    assertEquals("sms.search", DiffractionSmsCommand.Search.rawValue)
  }
}
