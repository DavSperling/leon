import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CardPointerSensor } from './card-pointer-sensor';

const [activator] = CardPointerSensor.activators;

// Un appui sur `target`, que la carte (`currentTarget`) contient ou non dans son DOM.
function press(inside: boolean, nativeEvent = { isPrimary: true, button: 0 }) {
  const onActivation = vi.fn();
  const event = {
    nativeEvent,
    currentTarget: { contains: () => inside },
    target: {},
  } as unknown as PointerEvent;
  return { granted: activator?.handler(event, { onActivation }), onActivation };
}

describe('CardPointerSensor', () => {
  it('saisit la carte quand l’appui part de la carte', () => {
    const { granted, onActivation } = press(true);

    expect(granted).toBe(true);
    expect(onActivation).toHaveBeenCalledOnce();
  });

  it('ignore un appui venu d’un menu en portail', () => {
    const { granted, onActivation } = press(false);

    expect(granted).toBe(false);
    expect(onActivation).not.toHaveBeenCalled();
  });

  it('ignore, comme le PointerSensor, un autre bouton que le principal', () => {
    expect(press(true, { isPrimary: true, button: 2 }).granted).toBe(false);
  });
});
