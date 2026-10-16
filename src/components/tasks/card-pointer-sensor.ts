import { PointerSensor, type PointerSensorOptions } from '@dnd-kit/core';
import type { PointerEvent } from 'react';

// Le PointerSensor, sauf qu'un appui venu d'un menu en portail (sélecteur ouvert) ne saisit pas la
// carte : il lui remonte par l'arbre React, bien qu'il ne soit pas dans la carte du DOM.
export class CardPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (event: PointerEvent, options: PointerSensorOptions): boolean =>
        event.currentTarget.contains(event.target as Node) &&
        PointerSensor.activators[0]?.handler(event, options) === true,
    },
  ];
}
