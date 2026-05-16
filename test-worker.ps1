# PowerShell test script for Cloudflare Worker
# Usage: .\test-worker.ps1

# Test data - use an existing transcript ID from your database
$TRANSCRIPT_ID = "628a9667-00ca-4b23-91b8-b62482be2d80"
$CONTENT = "John: Hello everyone. Sarah: Hi there. John: Thanks for joining. We need to decide on pricing. Sarah: I think tiered pricing is good. John: Great, Sarah can you research competitor pricing by Friday? Sarah: Sure. Mike: I'll update the website next week."
$TITLE = "Pricing Discussion"

# Create test job body
$jobBody = @{
    transcriptId = $TRANSCRIPT_ID
    content = $CONTENT
    title = $TITLE
} | ConvertTo-Json

# Send POST request to local worker
Write-Host "Testing Worker..."
Invoke-WebRequest -Uri "http://localhost:8787" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "upstash-signature" = "test-signature"
  } `
  -Body $jobBody `
  -UseBasicParsing

Write-Host "`n[+] Test complete"
