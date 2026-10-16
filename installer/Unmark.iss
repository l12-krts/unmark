; Inno Setup 6.5+ script for Unmark.
;
; Normally compiled by build.py, which passes the version and paths:
;     .venv\Scripts\python build.py
; To compile by hand after a build (dist\Unmark exists):
;     ISCC installer\Unmark.iss

#define AppName "Unmark"
#define AppExeName "Unmark.exe"
#define AppPublisher "lab.krts"
#define AppURL "https://krts.dev"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir SourcePath + "..\dist\Unmark"
#endif
#ifndef OutputDir
  #define OutputDir SourcePath + "..\dist"
#endif
#ifndef IconFile
  #define IconFile SourcePath + "..\assets\unmark.ico"
#endif
#ifndef WizardLarge
  #define WizardLarge SourcePath + "..\build\wizard-large-100.bmp"
#endif
#ifndef WizardSmall
  #define WizardSmall SourcePath + "..\build\wizard-small-100.bmp"
#endif

[Setup]
; Keep AppId the same forever: it is how Windows recognises upgrades of this app.
AppId={{65839DC8-5CC7-4BF7-B8F6-342B0192FB6C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} Setup
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
; Per-user install by default (no admin prompt); the user can choose "all users" instead.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutputDir}
OutputBaseFilename={#AppName}-{#AppVersion}-setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
; Follows the Windows light/dark setting, like the app.
WizardStyle=modern dynamic
WizardImageFile={#WizardLarge}
WizardSmallImageFile={#WizardSmall}
WizardImageAlphaFormat=defined
; ~3 GB of CUDA libraries: multithreaded LZMA2, not solid, keeps the build to minutes.
Compression=lzma2/normal
SolidCompression=no
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=8
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
UsedUserAreasWarning=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[InstallDelete]
; Upgrades: clear the previous version's bundled files so no stale libraries remain.
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourcePath}..\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; AppUserModelID: "lab.krts.Unmark"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; AppUserModelID: "lab.krts.Unmark"

[UninstallDelete]
; Settings and the log. The downloaded models stay in the shared Hugging Face / torch caches.
Type: filesandordirs; Name: "{userappdata}\Unmark"
Type: filesandordirs; Name: "{localappdata}\Unmark"

[Run]
; Started through Explorer, not by Setup: a process Setup starts directly inherits its RedirectionGuard
; mitigation, which blocks the symlinks in the Hugging Face model cache, so the models wouldn't load.
Filename: "{win}\explorer.exe"; Parameters: """{app}\{#AppExeName}"""; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebView2Key = 'Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasWebView2: Boolean;
var
  Version: String;
begin
  Result :=
    (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\' + WebView2Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKLM, 'SOFTWARE\' + WebView2Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU, 'Software\' + WebView2Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  // Unmark's window is Microsoft Edge WebView2 (built into Windows 11, sometimes missing on Windows 10).
  if not HasWebView2 then
    Result := MsgBox('Unmark needs the Microsoft Edge WebView2 Runtime, which isn''t installed on this PC.' + #13#10#13#10 +
                     'You can install it afterwards from https://go.microsoft.com/fwlink/p/?LinkId=2124703' + #13#10#13#10 +
                     'Continue with the installation?', mbConfirmation, MB_YESNO) = IDYES;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  // First launch downloads the detection and fill models (~1.7 GB).
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 +
      'The first time it starts, Unmark downloads its models (about 1.7 GB). That happens once.';
end;
