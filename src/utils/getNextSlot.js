export function getNextSlot() {
  const now = new Date();
  let minutes = now.getMinutes();

  const slots = [0, 15, 30, 45];
  let next = slots.find(x => x > minutes);

  if (next === undefined) {
    next = 0;
    now.setHours(now.getHours() + 1);
  }

  now.setMinutes(next);
  now.setSeconds(0);
  now.setMilliseconds(0);

  return now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}
