{
  description = "Inject JavaScript or TypeScript into running processes with Frida";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # nix build / nix run / nix profile install
      packages = forEachSystem (pkgs: rec {
        frida-inject = pkgs.callPackage ./package.nix { };
        default = frida-inject;
      });

      # Adds `pkgs.frida-inject` to your own nixpkgs.
      overlays.default = final: _prev: {
        frida-inject = final.callPackage ./package.nix { };
      };

      # nix develop: everything needed to work on this project.
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs ];
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixfmt);
    };
}
