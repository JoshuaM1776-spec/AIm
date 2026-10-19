// Aim — "Learn something": topics you pick, each with a short, hand-picked list of channels that
// teach it well. Aim shows the newest videos from them (YouTube's public channel feeds, no AI). Shared
// by YouTube pages (content/learn.js) and Settings. Channels are found by @handle; the id is only a
// hint, so a wrong or changed one is looked up again rather than breaking the row.
// Every handle and id checked on real YouTube (tools/real-youtube-check.mjs, October 2026). Which
// channels belong here is still yours to review before release (docs/ROADMAP.md → Learn something).

const LEARN_TOPICS = [
  { id: "science", name: "Science", channels: [
    { name: "Veritasium", handle: "@veritasium", id: "UCHnyfMqiRRG1u-2MsSQLbXA" },
    { name: "Kurzgesagt", handle: "@kurzgesagt", id: "UCsXVk37bltHxD1rDPwtNM8Q" },
    { name: "SciShow", handle: "@SciShow", id: "UCZYTClx2T1of7BRZ86-8fow" },
    { name: "Smarter Every Day", handle: "@smartereveryday", id: "UC6107grRI4m0o2-emgoDnAA" },
    { name: "Crash Course", handle: "@crashcourse", id: "UCX6b17PVsYBQ0ip5gyeme-Q" }] },
  { id: "math", name: "Math", channels: [
    { name: "3Blue1Brown", handle: "@3blue1brown", id: "UCYO_jab_esuFRV4b17AJtAw" },
    { name: "Numberphile", handle: "@numberphile", id: "UCoxcjq-8xIDTYp3uz647V5A" },
    { name: "Khan Academy", handle: "@khanacademy", id: "UC4a-Gbdw7vOaccHmFo40b9g" },
    { name: "Stand-up Maths", handle: "@standupmaths", id: "UCSju5G2aFaWMqn-_0YBtq5A" },
    { name: "Mathologer", handle: "@Mathologer", id: "UC1_uAIS3r8Vu6JjXWvastJg" }] },
  { id: "space", name: "Space", channels: [
    { name: "PBS Space Time", handle: "@pbsspacetime", id: "UC7_gcs09iThXybpVgjHZ_7g" },
    { name: "NASA", handle: "@NASA", id: "UCLA_DiR1FfKNvjuUpBHmylQ" },
    { name: "Scott Manley", handle: "@scottmanley", id: "UCxzC4EngIsMrPmbm6Nxvb-A" },
    { name: "Everyday Astronaut", handle: "@EverydayAstronaut", id: "UC6uKrU_WqJ1R2HMTY3LIx5Q" }] },
  { id: "engineering", name: "Engineering", channels: [
    { name: "Real Engineering", handle: "@RealEngineering", id: "UCR1IuLEqb6UEA_zQ81kwXfg" },
    { name: "Practical Engineering", handle: "@PracticalEngineeringChannel", id: "UCMOqf8ab-42UUQIdVoKwjlQ" },
    { name: "Mark Rober", handle: "@MarkRober", id: "UCY1kMZp36IQSyNx_9h4mpCg" },
    { name: "Engineering Explained", handle: "@EngineeringExplained", id: "UClqhvGmHcvWL9w3R48t9QXQ" },
    { name: "Stuff Made Here", handle: "@StuffMadeHere", id: "UCj1VqrHhDte54oLgPG4xpuQ" }] },
  { id: "history", name: "History", channels: [
    { name: "OverSimplified", handle: "@OverSimplified", id: "UCNIuvl7V8zACPpTmmNIqP2A" },
    { name: "Kings and Generals", handle: "@KingsandGenerals", id: "UCMmaBzfCCwZ2KqaBJjkj0fw" },
    { name: "Historia Civilis", handle: "@HistoriaCivilis", id: "UCv_vLHiWVBh_FR9vbeuiY-A" },
    { name: "The Fat Electrician", handle: "@the_fat_electrician", id: "UC_T3Zsw2257Ke-g3F20ZCRA" },
    { name: "History Dose", handle: "@HistoryDose", id: "UCLCckD5PjOk2M3iS_nPcjNQ" },
    { name: "Crash Course", handle: "@crashcourse", id: "UCX6b17PVsYBQ0ip5gyeme-Q" }] },
  { id: "coding", name: "Coding", channels: [
    { name: "Fireship", handle: "@Fireship", id: "UCsBjURrPoezykLs9EqgamOA" },
    { name: "freeCodeCamp", handle: "@freecodecamp", id: "UC8butISFwT-Wl7EV0hUK0BQ" },
    { name: "Computerphile", handle: "@Computerphile", id: "UC9-y-6csu5WGm29I7JiwpnA" },
    { name: "CS50", handle: "@cs50", id: "UCcabW7890RKJzL968QWEykA" },
    { name: "The Coding Train", handle: "@TheCodingTrain", id: "UCvjgXvBlbQiydffZU7m1_aw" }] },
  { id: "money", name: "Personal finance", channels: [
    { name: "The Plain Bagel", handle: "@ThePlainBagel", id: "UCFCEuCsyWP0YkP3CZ3Mr01Q" },
    { name: "Ben Felix", handle: "@BenFelixCSI", id: "UCDXTQ8nWmx_EhZ2v-kp7QxA" },
    { name: "Two Cents", handle: "@TwoCentsPBS", id: "UCL8w_A8p8P1HWI3k6PR5Z6w" }] },
  { id: "aviation", name: "Aviation", channels: [
    { name: "Mentour Pilot", handle: "@MentourPilot", id: "UCwpHKudUkP5tNgmMdexB3ow" },
    { name: "Green Dot Aviation", handle: "@GreenDotAviation", id: "UCfCNU6LWB66VR48V58d2KOg" },
    { name: "Captain Joe", handle: "@flywithcaptainjoe", id: "UC88tlMjiS7kf8uhPWyBTn_A" }] }
];
