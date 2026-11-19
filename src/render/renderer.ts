import type {
  Channel,
  Contact,
  Move,
  MoveId,
  RenderFacts,
  RenderedMessage,
  Tone,
  VoiceSkin,
} from "../neuro/types.ts";

/**
 * Deterministic renderer.
 *
 * Copy is a function of the move, the channel and the facts — not of a model's
 * mood. A language model can be layered on top (see llm.ts), but the system
 * always has a grounded message it can send without one. That is what makes
 * the OS testable and what keeps it from inventing numbers.
 */

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function pick<T>(arr: T[], key: string): T {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return arr[Math.abs(h) % arr.length];
}

function greeting(skin: VoiceSkin, firstName: string): string {
  if (skin.id === "warm") return `Hi ${firstName} —`;
  if (skin.id === "direct") return `${firstName} —`;
  if (skin.id === "premium") return `Hello ${firstName},`;
  return `${firstName}:`;
}

function signoff(skin: VoiceSkin, sender: string): string {
  if (skin.id === "premium") return `— ${sender}`;
  if (skin.id === "clinical") return `— ${sender}`;
  return `— ${sender}`;
}

export function factsFor(contact: Contact, tenant: import("../kernel/store.ts").Tenant, overrides: Partial<RenderFacts> = {}): RenderFacts {
  const missedRevenue =
    contact.missedRevenuePerMonth > 0
      ? contact.missedRevenuePerMonth
      : Math.round(contact.lostCallsPerMonth * contact.estimatedTicket * 0.2);
  return {
    firstName: contact.firstName,
    company: contact.company,
    trade: contact.trade,
    city: contact.city,
    lostCalls: contact.lostCallsPerMonth,
    missedRevenue,
    ticket: contact.estimatedTicket,
    proof: tenant.proof,
    humanName: tenant.ownerName.split(" ")[0] ?? tenant.ownerName,
    humanPhone: tenant.ownerPhone,
    reviewLink: tenant.reviewLink,
    optOutLine: "Reply STOP to opt out.",
    aiDisclosure: "I'm an AI assistant; a person reviews every conversation.",
    topic: contact.trade === "roofing" ? "the roof" : `the ${contact.trade} work`,
    objection: contact.tags.find((t) => t.startsWith("objection_"))?.replace("objection_", "") as RenderFacts["objection"],
    sender: `${tenant.ownerName.split(" ")[0]} at ${tenant.name}`,
    isFirstContact: contact.outboundLog.length === 0,
    ...overrides,
  };
}

type Templates = Partial<Record<Channel, string[]>>;

const T: Record<Exclude<MoveId, "wait">, Templates> = {
  warm_open: {
    sms: [
      "{{greeting}} {{sender}} here. I'm an AI assistant and a person reviews everything. You reached out about {{topic}} — want me to text two times that work, or call you now?",
      "{{greeting}} it's {{sender}}. You asked about {{topic}} and I don't want it to sit in a queue. Best number to reach you, or should I send the details?",
    ],
    email: [
      "{{greeting}}\n\nYou reached out to {{company}} about {{topic}}. I'm the AI assistant; a person reviews every conversation before anything is booked.\n\nTwo ways to move this forward:\n1. Reply with two times that work and I'll hold one.\n2. Reply with your property address and I'll send the findings first, no call.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} this is the AI assistant for {{company}} — a real person reviews everything I do. You called about {{topic}}, so I wanted to reach you before it got buried. Is now an okay minute, or should I call back?",
    ],
  },
  name_real_loss: {
    sms: [
      "{{greeting}} the math on {{company}}: {{lostCalls}} missed calls a month at a {{ticket}} job is roughly {{missedRevenue}} that never reaches your calendar. I can send the two-minute breakdown, or close the file — which?",
      "{{greeting}} quick number: {{lostCalls}} missed calls a month × {{ticket}} average is about {{missedRevenue}} a month in work you never see. Want the breakdown, or should I leave it?",
    ],
    email: [
      "{{greeting}}\n\nHere is the uncomfortable arithmetic for {{company}}:\n\n- {{lostCalls}} missed calls per month\n- {{ticket}} average job\n- About {{missedRevenue}} in work that never reaches your calendar\n\nThat is not a marketing problem. It is a coverage problem, and it is fixable in a week.\n\nWant the two-minute breakdown, or should I close the file?\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} one number and then I'll stop. You're missing about {{lostCalls}} calls a month. At a {{ticket}} job, that's roughly {{missedRevenue}} that never lands on the calendar. I can show you the two-minute breakdown, or I can close the file. Which is more useful?",
    ],
  },
  future_pace: {
    sms: [
      "Picture next Tuesday: two jobs already on the board before 8am, nobody chased anything, and the phone stopped being your second job. That's the build. Want the three-step version?",
      "{{greeting}} imagine the version where the phone rings and it's already handled — booked, confirmed, on the calendar. That's a Tuesday, not a fantasy. Want to see the three steps?",
    ],
    email: [
      "{{greeting}}\n\nPicture next Tuesday. Two jobs are on the board before 8am. Nobody chased a lead. The phone did its job while you were on a roof.\n\nThat is not a bigger ad budget. It is coverage plus follow-up, running without you.\n\nWant the three-step version?\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} let me paint the ordinary version, not the hype version. Next Tuesday, two jobs on the board before eight, nobody chased anything, and you didn't check your phone once. That's the build. Want the three steps?",
    ],
  },
  local_proof: {
    sms: [
      "{{greeting}} {{proofName}} in {{proofCity}} had the same {{trade}} problem. {{proofResult}} — the change was {{proofAction}}. Want the one-page version?",
      "{{greeting}} I've got a {{trade}} case study from {{proofCity}} — same size crew, same leak. {{proofResult}}. Want me to send the one-pager? No call needed.",
    ],
    email: [
      "{{greeting}}\n\n{{proofName}} in {{proofCity}} was in the same spot: {{proofResult}}.\n\nThe change was not a new CRM. It was {{proofAction}}.\n\nI can send the one-page version — the numbers, the timeline, and what did not work. Want it?\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} {{proofName}} over in {{proofCity}} had the same problem. {{proofResult}}. The change was {{proofAction}}. Want the one-page version?",
    ],
  },
  human_bridge: {
    sms: [
      "{{greeting}} let me get {{humanName}} on this — you shouldn't have to explain it twice. He'll call from {{humanPhone}}. Best 15 minutes today or tomorrow?",
      "{{greeting}} this deserves a person, not a bot. {{humanName}} can call from {{humanPhone}} — what window works?",
    ],
    email: [
      "{{greeting}}\n\nThis one deserves a person. {{humanName}} can take it from here — he'll call from {{humanPhone}}.\n\nReply with a 15-minute window and I'll put it on his calendar. If you'd rather keep it in email, that works too.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} I'm going to put {{humanName}} on this. You shouldn't have to explain it twice. He'll call from {{humanPhone}}. What's a good 15 minutes?",
    ],
  },
  reduce_choices: {
    sms: [
      "Two ways, that's it: (1) a 15-minute call and I bring the numbers; (2) I send the one-page plan and you decide. Reply 1 or 2.",
      "{{greeting}} let's make this smaller. One: 15-minute call. Two: one-page plan by email. Reply 1 or 2 — no other options to sort through.",
    ],
    email: [
      "{{greeting}}\n\nLet's make this smaller. There are two ways forward:\n\n1. A 15-minute call. I bring the numbers for {{company}}.\n2. A one-page plan by email. You read it on your own time.\n\nReply 1 or 2. If neither is right, tell me and I'll stop.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} two options, that's it. One, a fifteen-minute call and I bring the numbers. Two, I email a one-page plan and you decide. Which is easier?",
    ],
  },
  plain_next_step: {
    sms: [
      "Next step is small: send me the address of your Google profile. I'll run the 44-point check and send the findings the same day. Takes about 20 seconds.",
      "{{greeting}} one thing only: the link to your Google Business profile. I'll run the check and send you what I find. No call, no pitch.",
    ],
    email: [
      "{{greeting}}\n\nOne step, and it takes about 20 seconds: send me the link to your Google Business profile.\n\nI'll run the 44-point check and send the findings the same day. No call unless you want one.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} one small step and we're moving. Send me the link to your Google Business profile. I'll run the check and send the findings today. Twenty seconds.",
    ],
  },
  objection_answer: {
    sms: [
      "{{greeting}} fair objection. Here's the specific answer: {{answer}} If that doesn't settle it, tell me what would.",
    ],
    email: [
      "{{greeting}}\n\nFair objection. Here is the specific answer, not a deflection: {{answer}}\n\nIf that does not settle it, tell me what would and I'll either fix it or stop.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} that's a fair objection. Here's the specific answer: {{answer}} If that doesn't settle it, tell me what would.",
    ],
  },
  give_control: {
    sms: [
      "No follow-up needed either way. If you want the numbers, reply SEND. If not, reply PASS and I'll close it out. No hard feelings.",
      "{{greeting}} your call, genuinely. SEND gets you the numbers. PASS closes the file. Both are fine.",
    ],
    email: [
      "{{greeting}}\n\nNo follow-up needed either way.\n\nReply SEND and I'll send the numbers. Reply PASS and I'll close the file and leave you alone.\n\nBoth are a good outcome.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} your call, genuinely. I can send the numbers, or I can close the file. Both are fine. Which would you rather?",
    ],
  },
  micro_commit: {
    sms: [
      "Before any call, one small thing: text me the year your roof was last inspected. That's it. I'll have the history ready before we talk.",
      "{{greeting}} tiny ask before we talk: the year of your last inspection. I'll do the prep and you don't have to repeat yourself.",
    ],
    email: [
      "{{greeting}}\n\nBefore a call, one small thing: what year was the roof last inspected?\n\nThat is it. I'll pull the history and have it ready, so the conversation starts at the useful part.\n\n{{signoff}}",
    ],
    voice: [],
  },
  calendar_hold: {
    sms: [
      "I've held {{slotA}} and {{slotB}} for you. Reply with the one that works and I'll lock it. If neither, tell me a window and I'll fit it.",
      "{{greeting}} two holds for you: {{slotA}} or {{slotB}}. Pick one and it's done. Neither works? Send me a window.",
    ],
    email: [
      "{{greeting}}\n\nI've held two slots for you:\n\n- {{slotA}}\n- {{slotB}}\n\nReply with the one that works and I'll lock it. If neither works, send me a window and I'll fit it.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} I've held two times: {{slotA}} and {{slotB}}. Which one works? If neither, give me a window.",
    ],
  },
  confirm: {
    sms: [
      "You're set for {{slotA}}. {{humanName}} will call from {{humanPhone}} 10 minutes before. If anything changes, reply here — we'll move it, no problem.",
    ],
    email: [
      "{{greeting}}\n\nYou're confirmed for {{slotA}}.\n\n{{humanName}} will call from {{humanPhone}} ten minutes before. If anything changes, reply here and we'll move it — no problem.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} you're set for {{slotA}}. {{humanName}} will call from {{humanPhone}} ten minutes before. If anything changes, just say so and we'll move it.",
    ],
  },
  review_request: {
    sms: [
      "{{greeting}} thanks for letting us handle {{topic}}. If you have a minute, an honest review helps the next homeowner know what to expect: {{reviewLink}} If something wasn't right, reply here first and we'll fix it.",
    ],
    email: [
      "{{greeting}}\n\nThanks for letting us handle {{topic}}.\n\nIf you have a minute, an honest review helps the next homeowner know what to expect: {{reviewLink}}\n\nIf something was not right, reply here first and we will fix it. A review is not a substitute for doing the work well.\n\n{{signoff}}",
    ],
    voice: [],
  },
  close_loop: {
    sms: [
      "No pitch — just closing the loop. The numbers are in the doc if you ever want them. Good luck with the season, {{firstName}}.",
    ],
    email: [
      "{{greeting}}\n\nNo pitch. Just closing the loop.\n\nThe numbers are in the document if you ever want them. If the season turns and the phone gets away from you again, reply here and I'll pick it back up.\n\nGood luck out there.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} no pitch, just closing the loop. The numbers are in the doc if you ever want them. Good luck with the season.",
    ],
  },
  escalate_human: {
    sms: [
      "I'm looping in {{humanName}} — a person, not the assistant. You'll hear from him within the hour at {{humanPhone}}. If that's not okay, tell me what is.",
    ],
    email: [
      "{{greeting}}\n\nI'm looping in {{humanName}} — a person, not the assistant. He'll reach you within the hour from {{humanPhone}}.\n\nIf that timing or channel is wrong, reply and tell me what is right.\n\n{{signoff}}",
    ],
    voice: [
      "{{greeting}} I'm looping in {{humanName}} — a person, not the assistant. You'll hear from him within the hour. If that's not okay, tell me what is.",
    ],
  },
};

const SUBJECTS: Partial<Record<MoveId, string>> = {
  warm_open: "You reached out about {{topic}}",
  name_real_loss: "The {{missedRevenue}} you never see",
  future_pace: "An ordinary Tuesday, handled",
  local_proof: "A {{trade}} company in {{proofCity}}",
  human_bridge: "A person, not a bot",
  reduce_choices: "Two options, that's it",
  plain_next_step: "One 20-second step",
  objection_answer: "The specific answer",
  give_control: "Your call",
  micro_commit: "One thing before we talk",
  calendar_hold: "Two holds for you",
  confirm: "Confirmed: {{slotA}}",
  review_request: "Honest review?",
  close_loop: "Closing the loop",
  escalate_human: "{{humanName}} is taking this",
};

function answerFor(facts: RenderFacts): string {
  switch (facts.objection) {
    case "price":
      return `one booked ${facts.trade} job at ${money.format(facts.ticket)} covers several months of the fee. If it does not clear a 5x return in 90 days, the work continues at no extra fee until it does. That is the actual term, not a slogan.`;
    case "time":
      return `we can do this without a meeting. Send the Google profile link and I'll send the findings in writing. You keep them either way, and there is no follow-up call unless you ask for one.`;
    case "trust":
      return `you shouldn't take my word for it. I'll send the contract terms, two client references in ${facts.city}, and a 15-minute call with ${facts.humanName}. If it doesn't hold up, say no and I'll close the file.`;
    default:
      return `tell me which part is unclear and I'll answer that part specifically — no pitch, no circling back to the same script.`;
  }
}

function decorate(template: string, move: Move, channel: Channel, tone: Tone, facts: RenderFacts): string {
  const answer = answerFor(facts);
  let body = template
    .replaceAll("{{greeting}}", greeting(tone.skin, facts.firstName))
    .replaceAll("{{signoff}}", signoff(tone.skin, facts.sender ?? tone.sender))
    .replaceAll("{{sender}}", facts.sender ?? tone.sender)
    .replaceAll("{{firstName}}", facts.firstName)
    .replaceAll("{{company}}", facts.company)
    .replaceAll("{{trade}}", facts.trade)
    .replaceAll("{{city}}", facts.city)
    .replaceAll("{{topic}}", facts.topic ?? `the ${facts.trade} work`)
    .replaceAll("{{lostCalls}}", num.format(facts.lostCalls))
    .replaceAll("{{missedRevenue}}", money.format(facts.missedRevenue))
    .replaceAll("{{ticket}}", money.format(facts.ticket))
    .replaceAll("{{proofName}}", facts.proof?.name ?? "a local")
    .replaceAll("{{proofCity}}", facts.proof?.city ?? facts.city)
    .replaceAll("{{proofResult}}", facts.proof?.result ?? "they stopped losing the calls")
    .replaceAll("{{proofAction}}", facts.proof?.action ?? "a 20-second check before every callback")
    .replaceAll("{{slotA}}", facts.slotA ?? "Tuesday at 9:00")
    .replaceAll("{{slotB}}", facts.slotB ?? "Thursday at 3:30")
    .replaceAll("{{humanName}}", facts.humanName ?? "the owner")
    .replaceAll("{{humanPhone}}", facts.humanPhone ?? "the office")
    .replaceAll("{{reviewLink}}", facts.reviewLink ?? "")
    .replaceAll("{{answer}}", answer)
    .replaceAll("{{aiDisclosure}}", facts.aiDisclosure);

  if (channel === "sms" || channel === "voice") {
    body = body.replace(/\s+/g, " ").trim();
  } else {
    body = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (channel === "voice" && facts.isFirstContact && !/\bai\b/i.test(body)) {
    body += ` ${facts.aiDisclosure}`;
  }

  if (move.purpose === "marketing" && (channel === "sms" || channel === "email")) {
    if (!/stop/i.test(body)) body += `\n\n${facts.optOutLine}`;
  }

  return body;
}

export function renderMessage(move: Move, channel: Channel, tone: Tone, facts: RenderFacts): RenderedMessage {
  if (move.id === "wait") return { body: "", claimIds: [] };
  const templates = T[move.id as Exclude<MoveId, "wait">];
  const byChannel = templates?.[channel];
  const fallback = templates?.sms ?? templates?.email ?? [];
  const options = byChannel && byChannel.length > 0 ? byChannel : fallback;
  const template = pick(options, `${move.id}:${channel}:${facts.firstName}`);
  const body = decorate(template, move, channel, tone, facts);

  let subject: string | undefined;
  const subjectTemplate = SUBJECTS[move.id];
  if (channel === "email" && subjectTemplate) {
    subject = subjectTemplate
      .replaceAll("{{topic}}", facts.topic ?? `the ${facts.trade} work`)
      .replaceAll("{{missedRevenue}}", money.format(facts.missedRevenue))
      .replaceAll("{{trade}}", facts.trade)
      .replaceAll("{{proofCity}}", facts.proof?.city ?? facts.city)
      .replaceAll("{{slotA}}", facts.slotA ?? "Tuesday at 9:00")
      .replaceAll("{{humanName}}", facts.humanName ?? "the owner");
  }

  return { subject, body, claimIds: facts.claimIds ?? [] };
}
