; Mental Board — the setup file (3.3, MAP.md §6 "The setup file").
;
; Built by tools/build-setup.js from App\ (what `npm run build` writes), on
; the release runner or on a Windows machine with Inno Setup 6. Never shipped
; inside the app; it is what puts the app in its one place.
;
; It keeps the one-copy rule (CLAUDE.md) rather than reopening what 1.3 got
; wrong:
;   - one place, always: %LOCALAPPDATA%\Programs\Mental Board, per user, no
;     admin, and no folder page to pick another;
;   - replace, never merge: everything an older version left is deleted
;     before this one goes in ([InstallDelete]);
;   - it refuses while Mental Board is running — a running copy locks its
;     files, and its close button only hides it in the tray;
;   - one Start-menu entry pointing at that one path (a desktop one only if
;     asked), both removed by the uninstaller;
;   - the uninstaller removes the app folder and nothing else: the boards are
;     in Documents\My Boards and stay there;
;   - no updater, no update feed, no portable copy, nothing that runs at
;     startup.
;
; The AppId is the contract with every machine it has been installed on —
; it is how a newer setup finds the older one. Never change it.

#define AppName "Mental Board"
#define AppExe "Mental Board.exe"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppDir
  #define AppDir "..\App"
#endif
#ifndef OutDir
  #define OutDir "..\dist"
#endif

[Setup]
AppId={{6F4B2C1E-8D3A-4E7B-9C5F-1A2B3C4D5E6F}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Ahmad
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} setup
DefaultDirName={localappdata}\Programs\{#AppName}
DisableDirPage=yes
UsePreviousAppDir=no
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir={#OutDir}
OutputBaseFilename=Mental-Board-Setup-{#AppVersion}
SetupIconFile=..\src\assets\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
RestartApplications=no
SetupMutex=MentalBoardSetup

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Messages]
FinishedLabel=Mental Board is installed, in one folder of its own under AppData\Local\Programs. Your boards stay in Documents\My Boards — installing, updating or uninstalling never touches them.

[CustomMessages]
en.StillRunning=Mental Board is running.%n%nQuit it first: right-click its icon in the tray (by the clock, behind ^ if it is hidden) and choose Quit. Then press Retry.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[InstallDelete]
; replace, never merge: a file an older version left behind is what makes a new build behave like the old one
Type: filesandordirs; Name: "{app}\*"

[Files]
Source: "{#AppDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; the app's folder, whole; the boards are elsewhere (Documents\My Boards) and are not named here
Type: filesandordirs; Name: "{app}"

[Code]
{ Any Mental Board.exe at all. A copy running from somewhere else — a build
  from source in its App\ folder — would not lock these files, but it holds
  the single-instance lock, and would swallow the new copy's first launch. }
function AppRunning(): Boolean;
var
  Locator, Service, Found: Variant;
begin
  Result := False;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('.', 'root\CIMV2');
    Found := Service.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''{#AppExe}''');
    Result := Found.Count > 0;
  except
    Result := False;
  end;
end;

{ Asked until it is quit or the person gives up. Silent (/SUPPRESSMSGBOXES),
  the answer is Cancel: the setup ends, having changed nothing. }
function QuitFirst(): Boolean;
begin
  Result := True;
  while AppRunning() do
    if SuppressibleMsgBox(CustomMessage('StillRunning'), mbError, MB_RETRYCANCEL, IDCANCEL) = IDCANCEL then begin
      Result := False;
      Exit;
    end;
end;

function InitializeSetup(): Boolean;
begin
  Result := QuitFirst();
end;

function InitializeUninstall(): Boolean;
begin
  Result := QuitFirst();
end;
