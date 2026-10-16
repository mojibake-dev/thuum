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
  export function applyAnimationVariablesToActor(actorFormId: number, animationVariables: ActorAnimationVariables): boolean;
  // thuum docs/verbs/cast-action.md (fork m2-cast-action): an action the
  // player's actor performed, as Skyrim Platform's hook on the engine's
  // action entry reports it (the BGSAction, the idle the engine chose, the
  // graph event it sends, the input type bits, the actor's graph variables
  // at that moment)
  export interface ActionPerformedEvent {
    actor: Actor | null;
    action: number;
    idle: number;
    eventName: string;
    type: number;
    variables: ActorAnimationVariables;
  }
  export function on(eventName: "actionPerformed", callback: (event: ActionPerformedEvent) => void): EventHandle;
  // performs an action on an actor through the engine's action entry, the
  // idle given; true when the engine took it
  export function performAction(actorFormId: number, actionFormId: number, idleFormId: number, eventName: string, type: number): boolean;
  // thuum docs/verbs/marksman.md (fork m2-arrow-path): a projectile the
  // engine launched, Projectile::Launch's LaunchData as the fork reads it
  export interface ProjectileLaunchedEvent {
    shooter: number;
    projectile: number;
    weapon: number;
    ammo: number;
    spell: number;
    castingSource: number;
    originX: number;
    originY: number;
    originZ: number;
    angleX: number;
    angleZ: number;
    power: number;
    useOrigin: boolean;
  }
  export function on(eventName: "projectileLaunched", callback: (event: ProjectileLaunchedEvent) => void): EventHandle;
  // an arrow's flight as it starts: its first update's angles (after the
  // player's auto-aim), fork m2-arrow-path
  export interface ProjectileFlightEvent {
    shooter: number;
    projectile: number;
    weapon: number;
    ammo: number;
    x: number;
    y: number;
    z: number;
    angleX: number;
    angleZ: number;
    power: number;
  }
  export function on(eventName: "projectileFlight", callback: (event: ProjectileFlightEvent) => void): EventHandle;
}
