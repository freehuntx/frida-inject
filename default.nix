# For Nix without flakes: `nix-build` or `nix-env -if .`
{
  pkgs ? import <nixpkgs> { },
}:
pkgs.callPackage ./package.nix { }
