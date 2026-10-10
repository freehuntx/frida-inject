# The `frida-inject` command line tool, as the prebuilt standalone binary from
# the GitHub release named in nix/release.json.
#
# With flakes:     nix build .#frida-inject
# Without flakes:  nix-build
{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
}:

let
  # Version and file hashes. The release workflow updates this file after each
  # release (see scripts/update-nix-release.mjs).
  release = lib.importJSON ./nix/release.json;

  # Nix system → name of the release file.
  platforms = {
    x86_64-linux = "linux-x64";
    aarch64-linux = "linux-arm64";
    x86_64-darwin = "macos-x64";
    aarch64-darwin = "macos-arm64";
  };
  platform =
    platforms.${stdenv.hostPlatform.system}
      or (throw "frida-inject: unsupported system ${stdenv.hostPlatform.system}");
in
assert lib.assertMsg (release.version != null) "frida-inject: no release in nix/release.json yet";

stdenv.mkDerivation (finalAttrs: {
  pname = "frida-inject";
  inherit (release) version;

  src = fetchurl {
    url = "https://github.com/freehuntx/frida-inject/releases/download/v${finalAttrs.version}/frida-inject-${platform}.tar.gz";
    hash = release.hashes.${platform};
  };
  # The archive has no top-level folder.
  sourceRoot = ".";

  # The binary is the official Node.js build with the CLI packed into it, so on
  # Linux it has to be pointed at the libraries in the Nix store.
  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  dontConfigure = true;
  dontBuild = true;
  # Stripping would remove the packed CLI.
  dontStrip = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 frida-inject $out/bin/frida-inject
    install -Dm644 LICENSE.md $out/share/licenses/frida-inject/LICENSE.md
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    # On first start the binary unpacks its native parts into a cache folder.
    export FRIDA_INJECT_CACHE=$(mktemp -d)
    test "$($out/bin/frida-inject --version)" = "${finalAttrs.version}"
    runHook postInstallCheck
  '';

  meta = {
    description = "Inject JavaScript or TypeScript into running processes with Frida";
    homepage = "https://github.com/freehuntx/frida-inject";
    changelog = "https://github.com/freehuntx/frida-inject/blob/master/CHANGELOG.md";
    license = lib.licenses.mit;
    mainProgram = "frida-inject";
    platforms = lib.attrNames platforms;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
})
