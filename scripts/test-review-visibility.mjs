import assert from "node:assert/strict";
import { isPublicReview, isAdvancePreview } from "../src/lib/review-visibility.mjs";

assert.equal(isPublicReview({ reviewMode:"review", score:7.5 }), true);
assert.equal(isPublicReview({ reviewMode:"audience", audienceScore:8.2, sourceVoteCount:1200 }), true);
assert.equal(isPublicReview({ reviewMode:"preview" }), false);
assert.equal(isPublicReview({ reviewMode:"limited" }), false);
assert.equal(isPublicReview({ reviewMode:"limited", score:0 }), false);
assert.equal(isPublicReview({ score:7.1 }), true, "legacy scored reviews remain visible");
assert.equal(isPublicReview({ score:11 }), false, "invalid legacy scores are hidden");
assert.equal(isPublicReview({}), false, "unclassified unscored documents are hidden");

assert.equal(isAdvancePreview({ reviewMode:"preview", releaseDate:"2027-01-01" }, "2026-11-22"), true);
assert.equal(isAdvancePreview({ reviewMode:"preview", releaseDate:"2026-11-22" }, "2026-11-22"), false);
assert.equal(isAdvancePreview({ reviewMode:"limited", releaseDate:"2027-01-01" }, "2026-11-22"), false);
assert.equal(isAdvancePreview({ reviewMode:"review", releaseDate:"2027-01-01" }, "2026-11-22"), false);

console.log("Review visibility tests passed.");
