import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { HomeConstellation } from '@/components/site/home/constellation';
import { HomeRecit } from '@/components/site/home/recit';
import { HomeSignal } from '@/components/site/home/signal';
import { MaquetteSwitcher } from '@/components/site/maquette-switcher';
import { MAQUETTES, type MaquetteNumber } from '@/components/site/maquettes';

const HOMES: Record<MaquetteNumber, () => JSX.Element> = {
  '1': HomeSignal,
  '2': HomeConstellation,
  '3': HomeRecit,
};

type Params = Promise<{ n: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return MAQUETTES.map((m) => ({ n: m.n }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { n } = await params;
  const m = MAQUETTES.find((x) => x.n === n);
  return {
    title: m ? `Maquette ${m.n} · ${m.name}` : 'Maquette',
    robots: { index: false, follow: false },
  };
}

export default async function MaquettePage({ params }: { params: Params }) {
  const { n } = await params;
  const m = MAQUETTES.find((x) => x.n === n);
  if (!m) notFound();
  const Home = HOMES[m.n];
  return (
    <>
      <Home />
      <MaquetteSwitcher current={m.n} />
    </>
  );
}
