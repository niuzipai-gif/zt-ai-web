Option Explicit

Dim shell, projectRoot, scriptPath, command
Set shell = CreateObject("WScript.Shell")
projectRoot = "E:\ZT.AI\zt-ai-web"
scriptPath = projectRoot & "\start-gateway.ps1"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptPath & """"
shell.CurrentDirectory = projectRoot
shell.Run command, 0, False
