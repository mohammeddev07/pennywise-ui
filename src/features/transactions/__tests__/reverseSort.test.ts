import { reverseSort } from "../sortModel";
import { DEFAULT_SORT } from "../filterModel";

it("reverses the server default and every key of a custom sort", () => {
  expect(reverseSort([])).toEqual(DEFAULT_SORT.map((k) => ({ ...k, direction: "ASC" })));
  expect(
    reverseSort([
      { field: "amountMinor", direction: "DESC" },
      { field: "occurredOn", direction: "ASC" },
    ]),
  ).toEqual([
    { field: "amountMinor", direction: "ASC" },
    { field: "occurredOn", direction: "DESC" },
  ]);
  expect(reverseSort(reverseSort(DEFAULT_SORT))).toEqual(DEFAULT_SORT);
});
