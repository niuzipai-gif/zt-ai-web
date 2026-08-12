Option Explicit
Dim shell, root, command
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & root & "\start-agent.ps1"""
shell.Run command, 0, False
