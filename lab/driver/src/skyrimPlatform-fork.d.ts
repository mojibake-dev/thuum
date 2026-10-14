// The Skyrim Platform exports the lab driver uses that only our fork's
// codegen declares (skymp/skyrim-platform/src/platform_se/codegen/
// convert-files/skyrimPlatform.ts:1626-1636, the magic sync's). npm's
// @skyrim-platform/skyrim-platform 2.9.0 lacks them, and CI builds the
// driver without the fork checked out (tsconfig.json's paths try the fork's
// file first, then npm's). Declared as the fork declares them, so either
// source merges with this; the clients run the fork's Skyrim Platform.
export {};

declare module "skyrimPlatform" {
  export interface ActorAnimationVariables {
    booleans: ArrayBuffer;
    floats: ArrayBuffer;
    integers: ArrayBuffer;
  }
  export function getAnimationVariablesFromActor(actorFormId: number): ActorAnimationVariables;
}
