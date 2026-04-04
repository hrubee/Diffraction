package ai.diffraction.app.ui

import androidx.compose.runtime.Composable
import ai.diffraction.app.MainViewModel
import ai.diffraction.app.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
