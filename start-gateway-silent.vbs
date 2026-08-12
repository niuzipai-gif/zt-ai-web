Option Explicit

Dim shell, projectRoot, scriptPath, command, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = projectRoot & "\start-gateway.ps1"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptPath & """"
shell.CurrentDirectory = projectRoot
shell.Run command, 0, False
