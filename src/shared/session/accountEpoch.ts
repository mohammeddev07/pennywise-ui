let accountEpoch = 0;

export function getAccountEpoch() {
  return accountEpoch;
}

export function bumpAccountEpoch() {
  accountEpoch += 1;
  return accountEpoch;
}

export function isCurrentAccountEpoch(epoch: number) {
  return epoch === accountEpoch;
}
