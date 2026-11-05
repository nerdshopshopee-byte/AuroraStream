#!/usr/bin/env bash
# ============================================================
# AuroraStream — gera script NSIS customizado (build SEM wine)
#
# O electron-builder 25 gera o desinstalador executando o instalador
# stub sob wine — impossível em Linux sem wine (e ambientes CI/sandbox
# podem bloquear a emulação 32-bit via seccomp). Com um script NSIS
# customizado (nsis.script no electron-builder.yml), a etapa wine é
# PULADA e o desinstalador passa a ser gerado pelo próprio
# WriteUninstaller na instalação do usuário (comportamento NSIS
# padrão, 100% funcional).
#
# Este script:
#   1) patcheia include/installer.nsh do app-builder-lib IN PLACE
#      (File do desinstalador pré-gerado → WriteUninstaller nativo).
#      O makensis resolve !include a partir dos dirs registrados no
#      header gerado — o patch in-place garante que a versão correta
#      é compilada. Re-aplicar após cada npm ci (idempotente).
#   2) escreve o installer.nsi customizado (sem ramos BUILD_UNINSTALLER)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

TPL="node_modules/app-builder-lib/templates/nsis"

if [ ! -d "$TPL" ]; then
  echo "ERRO: templates do app-builder-lib não encontrados (rode npm ci no desktop/) — $TPL" >&2
  exit 1
fi

# 1) patch in-place do include do app-builder-lib
python3 - "$TPL" <<'PYEOF'
import sys, pathlib
root = pathlib.Path(sys.argv[1])
f = root / "include" / "installer.nsh"
text = f.read_text(encoding="utf-8")
old = 'File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"'
new = 'WriteUninstaller "$INSTDIR\\${UNINSTALL_FILENAME}"'
if old in text:
    text = text.replace(old, new)
    f.write_text(text, encoding="utf-8")
    print("[nsis] include/installer.nsh patchado (WriteUninstaller nativo)")
elif new in text:
    print("[nsis] já patchado")
else:
    print("[nsis] AVISO: linha do desinstalador não encontrada — verifique o template", file=sys.stderr)
    sys.exit(1)
PYEOF

# 2) installer.nsi customizado (sem passagem BUILD_UNINSTALLER/wine);
#    os includes (common.nsh, installSection.nsh, etc.) resolvem dos
#    templates do app-builder-lib (agora patchados)
mkdir -p build
cat > build/installer.nsi <<'NSIEOF'
; ============================================================
; AuroraStream — script NSIS customizado (build SEM wine)
; Base: template electron-builder 25.1.8.
; Diferenças do template padrão:
;  - sem passagem BUILD_UNINSTALLER (pré-geração sob wine, impossível
;    no Linux sem wine) — o desinstalador é gerado pelo próprio
;    WriteUninstaller quando o usuário instala (padrão NSIS)
;  - uninstaller.nsh sempre incluído (funções un.* no instalador)
; ============================================================
Var newStartMenuLink
Var oldStartMenuLink
Var newDesktopLink
Var oldDesktopLink
Var oldShortcutName
Var oldMenuDirectory

!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"
!include "allowOnlyOneInstallerInstance.nsh"

RequestExecutionLevel user

Var appExe
Var launchLink

!ifdef ONE_CLICK
  !include "oneClick.nsh"
!else
  !include "assistedInstaller.nsh"
!endif

!insertmacro addLangs

!ifmacrodef customHeader
  !insertmacro customHeader
!endif

Function .onInit
  Call setInstallSectionSpaceRequired
  SetOutPath $INSTDIR
  ${LogSet} on
  !insertmacro check64BitAndSetRegView
  !ifdef ONE_CLICK
    !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  !else
    ${IfNot} ${UAC_IsInnerInstance}
      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
    ${EndIf}
  !endif
  !insertmacro initMultiUser
FunctionEnd

!include "installUtil.nsh"

Section "install" INSTALL_SECTION_ID
  !include "installSection.nsh"
SectionEnd

Function setInstallSectionSpaceRequired
  !insertmacro setSpaceRequired ${INSTALL_SECTION_ID}
FunctionEnd

; ============================================================
; funções/section un.* — compiladas no instalador;
; WriteUninstaller as extrai como "Uninstall <app>.exe" na instalação
;
; No fluxo padrão do electron-builder, uninstaller.nsh é compilado numa
; 1ª passagem com BUILD_UNINSTALLER definido desde o início. Aqui o
; define é ativado apenas neste trecho final: os macros que emitem
; "Call <fn>" passam a emitir "Call un.<fn>" (exigência do NSIS em
; contexto un.) e recriamos a função un._GetProcessInfo, cuja variante
; un. só existiria se getProcessInfo.nsh tivesse sido incluída com o
; define já ativo.
; ============================================================
!define BUILD_UNINSTALLER

Function un._GetProcessInfo
  !insertmacro FUNC_GETPROCESSINFO
FunctionEnd

!include "uninstaller.nsh"
NSIEOF

echo "[nsis] pronto: build/installer.nsi (script NSIS customizado, sem wine)"
