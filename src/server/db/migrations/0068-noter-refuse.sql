-- 0068-noter-refuse.sql : le réglage `noter` du compte (T65 ; D30, C16 du plan de la mémoire à disposition). Daté, il
-- coupe `remember` au MCP pour ce membre, donc dans cet espace ; nul, `remember` écrit. Nul par défaut, comme
-- "onboardedAt" (0043) : les membres déjà là, et qui n'a jamais installé la CLI (claude.ai, ChatGPT), gardent
-- `remember`. L'échange du code de la page « Autoriser » (POST /api/v1/ordinateurs), la route à jeton du refus
-- (POST /api/v1/usages) et la section Mémoire du site l'écrivent (members.ts).
alter table "member" add column "noterRefuseLe" timestamptz;
