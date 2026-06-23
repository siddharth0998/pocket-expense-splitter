import type { Metadata } from "next";

export type SeoLandingPage = {
  slug: string;
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  primaryCta: string;
  highlights: string[];
  sections: {
    heading: string;
    body: string;
  }[];
  steps: string[];
  faqs: {
    question: string;
    answer: string;
  }[];
};

export const seoLandingPages: SeoLandingPage[] = [
  {
    slug: "free-expense-splitter",
    path: "/free-expense-splitter",
    title: "Free Expense Splitter for Shared Bills",
    description:
      "Use Splitvero as a free expense splitter for shared bills, receipts, recurring costs, and simple settle-up payments.",
    eyebrow: "Free expense splitter",
    h1: "Free expense splitter for shared bills",
    intro:
      "Splitvero helps groups record who paid, choose who was involved, and see the smallest set of payments needed to settle everything fairly.",
    primaryCta: "Start splitting expenses",
    highlights: [
      "Track shared bills without a spreadsheet",
      "Split expenses equally or by exact amounts",
      "Calculate fewer settle-up payments automatically",
      "Export your group ledger when you need records",
    ],
    sections: [
      {
        heading: "Designed for real group expenses",
        body:
          "Use Splitvero for dinners, subscriptions, groceries, travel costs, house supplies, utilities, and any situation where one person pays first and the group needs a clear record.",
      },
      {
        heading: "Clear balances for everyone",
        body:
          "Every expense adds to a shared ledger. Group members can see who paid, who was included, receipt links, and the current settlement suggestions.",
      },
      {
        heading: "Fewer payments at the end",
        body:
          "Instead of asking everyone to pay everyone else, Splitvero nets the balances and suggests the fewest practical payments to get the group even.",
      },
    ],
    steps: [
      "Create a group for the bill, trip, or household.",
      "Add the people who should be included.",
      "Record expenses with equal or exact splits.",
      "Use the settle-up suggestions to finish with fewer payments.",
    ],
    faqs: [
      {
        question: "Is Splitvero free to use?",
        answer:
          "Yes. Splitvero is free to use for creating groups, adding shared expenses, and calculating settle-up payments.",
      },
      {
        question: "Can I split one bill between only some people?",
        answer:
          "Yes. When you add an expense, you can choose exactly which group members were involved.",
      },
      {
        question: "Can I export the expense history?",
        answer:
          "Yes. Group activity can be exported to CSV for bookkeeping or personal records.",
      },
    ],
  },
  {
    slug: "roommate-expense-splitter",
    path: "/roommate-expense-splitter",
    title: "Roommate Expense Splitter",
    description:
      "Split rent, utilities, groceries, subscriptions, and household supplies with a roommate expense splitter built for shared living.",
    eyebrow: "Roommate expense splitter",
    h1: "Roommate expense splitter for rent, utilities, and groceries",
    intro:
      "Keep a clean record of household expenses so roommates can share costs without relying on memory, screenshots, or a messy group chat.",
    primaryCta: "Create a roommate group",
    highlights: [
      "Track rent, utilities, groceries, and supplies",
      "Handle recurring monthly bills",
      "Attach receipts for shared purchases",
      "See who owes whom at any time",
    ],
    sections: [
      {
        heading: "One ledger for the household",
        body:
          "Roommate bills often repeat every month, but small purchases add up too. Splitvero keeps both predictable bills and one-off expenses in the same place.",
      },
      {
        heading: "Useful for recurring bills",
        body:
          "Mark repeating costs like internet, rent, or subscriptions as monthly expenses so they stay visible and organized for the group.",
      },
      {
        heading: "Fair splits when costs are not equal",
        body:
          "If one roommate uses a different share or only some people join a purchase, use exact splits instead of forcing everything to be even.",
      },
    ],
    steps: [
      "Create a household group.",
      "Add each roommate as a member.",
      "Record rent, utilities, supplies, and groceries as they happen.",
      "Review balances and settle up weekly or monthly.",
    ],
    faqs: [
      {
        question: "Can Splitvero handle monthly roommate bills?",
        answer:
          "Yes. Splitvero supports recurring monthly expenses for predictable household costs.",
      },
      {
        question: "Can roommates see the shared ledger?",
        answer:
          "Yes. Group members can view the ledger and understand how the current balance was calculated.",
      },
      {
        question: "Can I split groceries with only some roommates?",
        answer:
          "Yes. You can choose which members are included for each expense.",
      },
    ],
  },
  {
    slug: "trip-expense-splitter",
    path: "/trip-expense-splitter",
    title: "Trip Expense Splitter",
    description:
      "Split vacation costs, hotels, meals, gas, tickets, and group activities with a trip expense splitter for friends and travel groups.",
    eyebrow: "Trip expense splitter",
    h1: "Trip expense splitter for friends and travel groups",
    intro:
      "Track travel costs as they happen so your group can settle the trip cleanly after hotels, meals, gas, rides, tickets, and activities.",
    primaryCta: "Start a trip group",
    highlights: [
      "Track hotels, meals, gas, rides, and tickets",
      "Split expenses between the right travelers",
      "Attach receipt photos to trip costs",
      "Settle the whole trip with fewer payments",
    ],
    sections: [
      {
        heading: "Built for uneven travel spending",
        body:
          "On trips, different people often pay for different categories. Splitvero records each payment and calculates the final balance for the group.",
      },
      {
        heading: "Handle partial group activities",
        body:
          "Not every traveler joins every meal or activity. Select only the people involved when adding an expense so the split stays fair.",
      },
      {
        heading: "Finish the trip without payment chains",
        body:
          "At the end of the trip, Splitvero suggests direct settle-up payments so the group can close the ledger quickly.",
      },
    ],
    steps: [
      "Create a group for the trip.",
      "Add the travelers who should share costs.",
      "Record expenses during the trip with receipts when useful.",
      "Use the settlement list when the trip ends.",
    ],
    faqs: [
      {
        question: "Can I split one activity with only part of the travel group?",
        answer:
          "Yes. Each expense can include only the travelers who participated.",
      },
      {
        question: "Can I upload receipts from a trip?",
        answer:
          "Yes. Receipt uploads help everyone verify the exact cost later.",
      },
      {
        question: "Does Splitvero reduce the number of payments?",
        answer:
          "Yes. It nets balances and suggests fewer settle-up transactions.",
      },
    ],
  },
  {
    slug: "split-rent-calculator",
    path: "/split-rent-calculator",
    title: "Split Rent Calculator",
    description:
      "Use Splitvero as a split rent calculator for roommates who need to divide rent, utilities, internet, and other household bills.",
    eyebrow: "Split rent calculator",
    h1: "Split rent calculator for roommates",
    intro:
      "Use Splitvero to track rent shares, recurring household bills, and the smaller purchases that roommates often forget to settle.",
    primaryCta: "Split rent now",
    highlights: [
      "Record rent and utilities in one group",
      "Use equal or exact rent shares",
      "Repeat monthly bills automatically",
      "Keep a history of household payments",
    ],
    sections: [
      {
        heading: "Split equal or custom rent shares",
        body:
          "Some households split rent evenly, while others divide costs by room size, income, or private agreements. Exact splits make those custom shares easier to track.",
      },
      {
        heading: "Include utilities and internet",
        body:
          "Rent is rarely the only shared bill. Add electricity, water, internet, streaming subscriptions, and maintenance costs in the same ledger.",
      },
      {
        heading: "Settle on a monthly rhythm",
        body:
          "Roommates can review balances at the end of the month and make the minimum set of payments needed to get even.",
      },
    ],
    steps: [
      "Create a household group.",
      "Add rent as an equal or exact split.",
      "Add utilities, internet, and supplies during the month.",
      "Settle the final balance when bills are due.",
    ],
    faqs: [
      {
        question: "Can I split rent unequally?",
        answer:
          "Yes. Use exact splits when roommates have different rent shares.",
      },
      {
        question: "Can I add utilities to the same rent group?",
        answer:
          "Yes. Rent, utilities, subscriptions, groceries, and supplies can all live in the same group.",
      },
      {
        question: "Can rent repeat every month?",
        answer:
          "Yes. Monthly recurring expenses are supported for predictable bills.",
      },
    ],
  },
  {
    slug: "unequal-expense-splitter",
    path: "/unequal-expense-splitter",
    title: "Unequal Expense Splitter",
    description:
      "Split expenses unequally with exact amounts for roommates, trips, meals, subscriptions, and shared purchases.",
    eyebrow: "Unequal expense splitter",
    h1: "Unequal expense splitter with exact shares",
    intro:
      "Not every shared cost should be divided evenly. Splitvero lets you enter exact amounts so each person pays the right share.",
    primaryCta: "Create an exact split",
    highlights: [
      "Enter exact shares for each person",
      "Exclude people who were not involved",
      "Keep equal and exact expenses in one ledger",
      "Settle the final net balance",
    ],
    sections: [
      {
        heading: "Fair when equal splits do not fit",
        body:
          "Use exact splits for different room sizes, different meal orders, different travel activities, or purchases where only some people shared the cost.",
      },
      {
        heading: "Avoid manual balance math",
        body:
          "Splitvero adds exact and equal expenses together, then calculates the final balances automatically.",
      },
      {
        heading: "Keep the explanation clear",
        body:
          "Each expense stores the payer, amount, and participants so group members can understand why they owe what they owe.",
      },
    ],
    steps: [
      "Create a group and add members.",
      "Choose exact split when adding an expense.",
      "Enter each person's owed amount.",
      "Use the settlement suggestions after balances are calculated.",
    ],
    faqs: [
      {
        question: "Can one group contain both equal and unequal splits?",
        answer:
          "Yes. You can use equal splits for some expenses and exact splits for others.",
      },
      {
        question: "Do exact split amounts need to match the expense total?",
        answer:
          "Yes. Exact splits should add up to the full expense amount.",
      },
      {
        question: "Can I exclude a member from an expense?",
        answer:
          "Yes. Only include the members who should share that specific cost.",
      },
    ],
  },
  {
    slug: "split-bills-with-friends",
    path: "/split-bills-with-friends",
    title: "Split Bills With Friends",
    description:
      "Split bills with friends for meals, trips, events, shared gifts, subscriptions, and group purchases.",
    eyebrow: "Split bills with friends",
    h1: "Split bills with friends without confusion",
    intro:
      "Use Splitvero when friends share meals, trips, events, gifts, rides, or subscriptions and need a simple way to settle up.",
    primaryCta: "Start a friends group",
    highlights: [
      "Record who paid for each bill",
      "Choose the friends involved in each expense",
      "Track receipts and payment history",
      "See simple settle-up suggestions",
    ],
    sections: [
      {
        heading: "Better than a group chat total",
        body:
          "A chat message can get buried. Splitvero keeps each shared bill in a structured ledger with the payer, amount, participants, and optional receipt.",
      },
      {
        heading: "Useful before and after events",
        body:
          "Track costs before an event, during a trip, or after a dinner. The balance stays updated as new expenses are added.",
      },
      {
        heading: "Simple final payments",
        body:
          "When the group is ready, Splitvero converts the ledger into a short list of payments so everyone can settle up.",
      },
    ],
    steps: [
      "Create a group for the friends involved.",
      "Add each bill when someone pays.",
      "Choose equal or exact splits depending on the situation.",
      "Use the settlement list to close the balance.",
    ],
    faqs: [
      {
        question: "Can friends add their own expenses?",
        answer:
          "Yes. Friends can log in and add their own expenses to the group.",
      },
      {
        question: "Can I use Splitvero for dinner bills?",
        answer:
          "Yes. You can split a dinner equally or enter exact shares for each person.",
      },
      {
        question: "Can I use it for group gifts or events?",
        answer:
          "Yes. Splitvero works for any shared purchase where one or more people paid first.",
      },
    ],
  },
];

export const getSeoLandingPage = (slug: string) => {
  const page = seoLandingPages.find((page) => page.slug === slug);

  if (!page) {
    throw new Error(`Unknown SEO landing page: ${slug}`);
  }

  return page;
};

export const seoLandingPageMetadata = (page: SeoLandingPage): Metadata => ({
  title: page.title,
  description: page.description,
  alternates: {
    canonical: page.path,
  },
  openGraph: {
    title: `${page.title} | Splitvero`,
    description: page.description,
    url: page.path,
  },
  twitter: {
    title: `${page.title} | Splitvero`,
    description: page.description,
  },
});
