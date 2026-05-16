#!/bin/bash

# Test data
TRANSCRIPT_ID="test-12345"
CONTENT="John: Hey team, thanks for joining. We need to decide on the new pricing model. Sarah: I think we should go with tiered pricing like competitors. John: Makes sense. Sarah, can you research competitor pricing by Friday? Sarah: Sure, I'll get that done. Mike: We should also update the website. I'll handle that next week."
TITLE="Q4 Pricing Meeting"

# Create test job body
JOB_BODY=$(cat <<EOF
{
  "transcriptId": "$TRANSCRIPT_ID",
  "content": "$CONTENT",
  "title": "$TITLE"
}
EOF
)

# Send POST request to local worker
echo "Testing Worker..."
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "upstash-signature: test-signature" \
  -d "$JOB_BODY"

echo -e "\n✓ Test complete"
