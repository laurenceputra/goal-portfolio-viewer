# Three Requests Implementation Plan

## Request 1: Button Styling Alignment

**Issue**: Sign Up and Login buttons should match the style of other buttons in the overlay

**Current State**:
- Register button: `📝 Sign Up` (line 4326)
- Login button: `🔑 Login` (line 4359)
- These buttons likely have different styling than overlay buttons

**Investigation Needed**:
- Check existing button classes in investments overlay
- Current Sign Up/Login buttons use what class?
- What are the standard button classes? (e.g., `.gpv-bucket-card`, `.gpv-trigger-btn`)

**Solution**:
- Apply consistent button styling class
- Match button size, padding, colors, hover effects
- Ensure responsive design consistent with other overlay buttons

---

## Request 2: Password Storage on Server Side

**Question**: "for the password how is it stored on the server side?"

**Answer**:
The password is stored with strong security measures:

### Client Side:
1. User enters password (e.g., "MyPassword123")
2. Client hashes: `SHA-256(password + userId)` → hex string
3. Sends X-Password-Hash header to server (NEVER sends plain password)

### Server Side (Hardened Storage):
1. Receives SHA-256 hash from client
2. Generates random 128-bit salt (unique per user)
3. Derives storage hash: `PBKDF2(sha256Hash, salt, 100,000 iterations)`
4. Stores in KV: `{ salt: "random", derivedHash: "pbkdf2output" }`

### Validation:
1. Client sends same SHA-256 hash
2. Server retrieves stored `{ salt, derivedHash }`
3. Server re-derives: `PBKDF2(incomingHash, storedSalt, 100k)`
4. Compares with timing-safe equality
5. Allows/denies access

### Security Properties:
- **Password never leaves client** (only SHA-256 hash)
- **100,000 iterations** makes brute force extremely slow
- **Per-user random salt** prevents rainbow table attacks
- **Backward compatible** (supports legacy format during migration)
- **OWASP compliant** (meets password storage guidelines)

**Implementation**: `workers/src/auth.js` - `deriveStorageHash()`, `generateSalt()`, `validatePassword()`

---

## Request 3: Files to Remove

**Analysis**: Identify temporary/planning files that should not remain long-term

### Categories:

#### A. Planning & Summary Files (REMOVE)
These are implementation planning documents, not user-facing docs:
- `SYNC_IMPLEMENTATION_SUMMARY.md` - Internal planning
- `SYNC_DELIVERABLES.md` - Project management doc
- `SYNC_FINAL_SUMMARY.md` - Completion summary
- `PASSWORD_AUTH_IMPLEMENTATION_COMPLETE.md` - Implementation summary
- `TASKS_1_3_7_8_9_SUMMARY.md` - Task tracking
- `CODE_REVIEW_FIXES_SUMMARY.md` - Internal review notes
- `PASSWORD_HARDENING_SUMMARY.md` - Internal security notes
- `SYNC_BUTTON_DEBUG_SUMMARY.md` - Debug notes
- `SYNC_DEPLOYMENT_TESTING.md` - Deployment notes (merge into workers/README.md)
- `SYNC_TESTING.md` - Testing notes (merge into TESTING.md)

#### B. Visual/Demo Files (REMOVE)
- `UI_DEMO.html` - Demo file, not needed
- `SYNC_UI_LAYOUT.md` - Visual layout doc, redundant
- `SYNC_UI_INTEGRATION.md` - Integration notes, redundant
- `SYNC_ARCHITECTURE_DIAGRAMS.md` - Merge into SYNC_ARCHITECTURE.md

#### C. Bug Fix Documentation (REMOVE)
- `BUGFIX_STORAGE_FORWARD_REFERENCE.md` - Historical bug, not needed long-term

#### D. Duplicate/Standalone Files in tampermonkey/ (REMOVE)
- `tampermonkey/SYNC_IMPLEMENTATION_SUMMARY.md` - Duplicate
- `tampermonkey/SYNC_INTEGRATION.md` - Duplicate/internal
- `tampermonkey/QUICK_START.md` - Move to docs/
- `tampermonkey/FILE_INDEX.md` - Remove (internal)
- `tampermonkey/sync_complete.js` - Reference file, not used
- `tampermonkey/sync_implementation.js` - Standalone (already integrated)
- `tampermonkey/sync_ui.js` - Standalone (already integrated)

#### E. Keep & Potentially Consolidate

**User-Facing Documentation (KEEP & ORGANIZE)**:
- `README.md` - Main project readme
- `TECHNICAL_DESIGN.md` - Architecture doc
- `docs/sync-setup.md` - User guide for sync feature

**Sync Architecture (KEEP & CONSOLIDATE INTO ONE)**:
- `SYNC_ARCHITECTURE.md` - Main technical spec (KEEP as primary)
- `PASSWORD_AUTH_GUIDE.md` - Merge into SYNC_ARCHITECTURE.md or docs/
- `MASTER_KEY_ARCHITECTURE.md` - Merge into SYNC_ARCHITECTURE.md
- `PASSWORD_AS_PROXY_SUMMARY.md` - Merge into SYNC_ARCHITECTURE.md
- `SYNC_USER_FLOWS.md` - Move to docs/sync-user-flows.md

**Testing & Deployment (KEEP)**:
- `TESTING.md` - Keep, consolidate testing info here
- `workers/README.md` - Keep, backend deployment guide
- `workers/test-password-auth.js` - Keep, integration tests

**Project Management (KEEP)**:
- `AGENTS.md` - Keep, development process
- `DEPLOYMENT.md` - Keep or merge into workers/README.md
- `LICENSE` - Keep
- `package.json`, `package-lock.json`, `eslint.config.mjs` - Keep

### Proposed Actions:

#### Step 1: Consolidate Documentation
1. Create single `docs/sync/` directory
2. Consolidate:
   - Architecture: `SYNC_ARCHITECTURE.md` (primary)
   - User guide: `docs/sync/setup.md`
   - User flows: `docs/sync/user-flows.md`
   - Backend: `workers/README.md`

#### Step 2: Remove Planning Files (15 files)
```bash
rm SYNC_IMPLEMENTATION_SUMMARY.md
rm SYNC_DELIVERABLES.md
rm SYNC_FINAL_SUMMARY.md
rm PASSWORD_AUTH_IMPLEMENTATION_COMPLETE.md
rm TASKS_1_3_7_8_9_SUMMARY.md
rm CODE_REVIEW_FIXES_SUMMARY.md
rm PASSWORD_HARDENING_SUMMARY.md
rm SYNC_BUTTON_DEBUG_SUMMARY.md
rm SYNC_DEPLOYMENT_TESTING.md
rm SYNC_TESTING.md
rm UI_DEMO.html
rm SYNC_UI_LAYOUT.md
rm SYNC_UI_INTEGRATION.md
rm SYNC_ARCHITECTURE_DIAGRAMS.md
rm BUGFIX_STORAGE_FORWARD_REFERENCE.md
```

#### Step 3: Remove Duplicate/Standalone Files (6 files)
```bash
rm tampermonkey/SYNC_IMPLEMENTATION_SUMMARY.md
rm tampermonkey/SYNC_INTEGRATION.md
rm tampermonkey/FILE_INDEX.md
rm tampermonkey/sync_complete.js
rm tampermonkey/sync_implementation.js
rm tampermonkey/sync_ui.js
```

#### Step 4: Consolidate Remaining Docs
- Merge PASSWORD_AUTH_GUIDE.md → SYNC_ARCHITECTURE.md (Security section)
- Merge MASTER_KEY_ARCHITECTURE.md → SYNC_ARCHITECTURE.md (Encryption section)
- Merge PASSWORD_AS_PROXY_SUMMARY.md → SYNC_ARCHITECTURE.md (Summary)
- Move SYNC_USER_FLOWS.md → docs/sync-user-flows.md
- Keep DEPLOYMENT.md or merge into workers/README.md

#### Step 5: Update README.md
- Add clear sync documentation section
- Point to consolidated docs

### Result:
**Before**: 30+ files scattered across root and subdirectories
**After**: ~10 well-organized files
- `README.md` - Main entry point
- `SYNC_ARCHITECTURE.md` - Complete technical reference
- `docs/sync-setup.md` - User setup guide
- `docs/sync-user-flows.md` - User workflows
- `workers/README.md` - Backend deployment
- `TECHNICAL_DESIGN.md` - Overall architecture
- `TESTING.md` - Testing procedures
- Standard project files (LICENSE, package.json, etc.)

### Files to Remove (21 total):
1. SYNC_IMPLEMENTATION_SUMMARY.md
2. SYNC_DELIVERABLES.md
3. SYNC_FINAL_SUMMARY.md
4. PASSWORD_AUTH_IMPLEMENTATION_COMPLETE.md
5. TASKS_1_3_7_8_9_SUMMARY.md
6. CODE_REVIEW_FIXES_SUMMARY.md
7. PASSWORD_HARDENING_SUMMARY.md
8. SYNC_BUTTON_DEBUG_SUMMARY.md
9. SYNC_DEPLOYMENT_TESTING.md
10. SYNC_TESTING.md
11. UI_DEMO.html
12. SYNC_UI_LAYOUT.md
13. SYNC_UI_INTEGRATION.md
14. SYNC_ARCHITECTURE_DIAGRAMS.md
15. BUGFIX_STORAGE_FORWARD_REFERENCE.md
16. tampermonkey/SYNC_IMPLEMENTATION_SUMMARY.md
17. tampermonkey/SYNC_INTEGRATION.md
18. tampermonkey/FILE_INDEX.md
19. tampermonkey/sync_complete.js
20. tampermonkey/sync_implementation.js
21. tampermonkey/sync_ui.js

### Files to Consolidate & Remove (4):
22. PASSWORD_AUTH_GUIDE.md → merge into SYNC_ARCHITECTURE.md
23. MASTER_KEY_ARCHITECTURE.md → merge into SYNC_ARCHITECTURE.md
24. PASSWORD_AS_PROXY_SUMMARY.md → merge into SYNC_ARCHITECTURE.md
25. SYNC_USER_FLOWS.md → move to docs/sync-user-flows.md

### Final Repository Structure:
```
/
├── README.md (updated with sync docs section)
├── SYNC_ARCHITECTURE.md (comprehensive tech ref)
├── TECHNICAL_DESIGN.md
├── TESTING.md
├── DEPLOYMENT.md (or merge into workers/README.md)
├── AGENTS.md
├── LICENSE
├── package.json
├── eslint.config.mjs
├── docs/
│   ├── sync-setup.md (user guide)
│   └── sync-user-flows.md (workflows)
├── workers/
│   ├── README.md (backend deployment)
│   ├── src/*.js
│   └── test-password-auth.js
└── tampermonkey/
    ├── goal_portfolio_viewer.user.js
    └── README.md
```

---

## Implementation Order:

### Phase 1: Fix Button Styling (Immediate)
1. Identify existing button classes
2. Apply to Sign Up/Login buttons
3. Test visual consistency
4. Commit changes

### Phase 2: Answer Password Storage Question (Immediate)
1. Reply to comment with detailed explanation
2. Reference implementation files
3. Explain security model

### Phase 3: Clean Up Files (Separate PR Recommended)
1. Create cleanup branch
2. Remove planning/temporary files (21 files)
3. Consolidate documentation (4 files)
4. Update README.md with new structure
5. Test that all links still work
6. Commit cleanup

**Recommendation**: Do Phase 1 & 2 in current PR, Phase 3 in separate cleanup PR to keep changes focused.
