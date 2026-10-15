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
}
