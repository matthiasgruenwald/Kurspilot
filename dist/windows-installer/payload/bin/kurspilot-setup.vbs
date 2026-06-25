Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
installRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
cmd = Chr(34) & installRoot & "\bin\kurspilot-setup.cmd" & Chr(34)
For i = 0 To WScript.Arguments.Count - 1
  cmd = cmd & " " & Chr(34) & WScript.Arguments(i) & Chr(34)
Next
shell.Run cmd, 0, False
