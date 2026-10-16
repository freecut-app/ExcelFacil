; Pergunta se a pessoa quer um atalho na área de trabalho.
!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Deseja criar um atalho do Excel Fácil na área de trabalho?" /SD IDYES IDNO excelFacilSemAtalho
    CreateShortCut "$DESKTOP\Excel Fácil.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  excelFacilSemAtalho:
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Excel Fácil.lnk"
!macroend
