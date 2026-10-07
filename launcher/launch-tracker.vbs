' Runs launch-tracker.ps1 with no visible console window. The desktop
' shortcut points here (wscript.exe launch-tracker.vbs).
Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\launch-tracker.ps1""", 0, False
