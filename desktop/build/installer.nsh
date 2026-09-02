; Default to a short install path so bundled Python (torch) stays under MAX_PATH.
; Keep Cancel visible and abortable on every wizard page, including InstFiles.
!ifndef VERILUMEN_INSTALLER_NSH
!define VERILUMEN_INSTALLER_NSH

!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Cancel VERILUMEN ATE Intelligence setup?"
!define MUI_CUSTOMFUNCTION_GUIINIT verilumenRestoreCancel

!macro preInit
  StrCpy $INSTDIR "C:\VERILUMEN"
!macroend

!macro customHeader
  ShowInstDetails show
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

Function verilumenRestoreCancel
  Push $0
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 1
  ; SW_SHOW = 5. Do not use ${SW_SHOW}: this include runs before WinMessages.nsh.
  ShowWindow $0 5
  Pop $0
FunctionEnd

!endif
