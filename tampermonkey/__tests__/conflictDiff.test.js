const {
    buildConflictDiffItems: buildConflictDiffItemsForMap,
    buildConflictDiffSections,
    buildFsmConflictDiffItems,
    formatSyncTarget,
    formatSyncFixed
} = require('../goal_portfolio_viewer.user.js');

describe('conflict diff helpers', () => {
    const baseConflict = {
        local: {
            goalTargets: { goal1: 10, goal2: 20 },
            goalFixed: { goal1: true }
        },
        remote: {
            goalTargets: { goal1: 10, goal2: 25 },
            goalFixed: { goal1: false }
        }
    };

    it('detects target change only', () => {
        const conflict = {
            local: { goalTargets: { goal1: 10 }, goalFixed: {} },
            remote: { goalTargets: { goal1: 15 }, goalFixed: {} }
        };
        const items = buildConflictDiffItemsForMap(conflict, { goal1: 'Goal One' });
        expect(items).toHaveLength(1);
        expect(items[0].goalName).toBe('Goal One');
        expect(items[0].localTargetDisplay).toBe('10.00%');
        expect(items[0].remoteTargetDisplay).toBe('15.00%');
        expect(items[0].localFixedDisplay).toBe('No');
        expect(items[0].remoteFixedDisplay).toBe('No');
    });

    it('ignores target changes when goal is fixed', () => {
        const conflict = {
            local: { goalTargets: { goal1: 10 }, goalFixed: { goal1: true } },
            remote: { goalTargets: { goal1: 15 }, goalFixed: { goal1: true } }
        };
        const items = buildConflictDiffItemsForMap(conflict, { goal1: 'Goal One' });
        expect(items).toHaveLength(0);
    });

    it('detects fixed change only', () => {
        const conflict = {
            local: { goalTargets: {}, goalFixed: { goal1: true } },
            remote: { goalTargets: {}, goalFixed: { goal1: false } }
        };
        const items = buildConflictDiffItemsForMap(conflict, { goal1: 'Goal One' });
        expect(items).toHaveLength(1);
        expect(items[0].localTargetDisplay).toBe('-');
        expect(items[0].remoteTargetDisplay).toBe('-');
        expect(items[0].localFixedDisplay).toBe('Yes');
        expect(items[0].remoteFixedDisplay).toBe('No');
    });

    it('detects target and fixed changes', () => {
        const items = buildConflictDiffItemsForMap(baseConflict, { goal1: 'Goal One', goal2: 'Goal Two' });
        expect(items).toHaveLength(2);
        const goalTwo = items.find(item => item.goalName === 'Goal Two');
        expect(goalTwo.localTargetDisplay).toBe('20.00%');
        expect(goalTwo.remoteTargetDisplay).toBe('25.00%');
    });

    it('falls back to goal id when name missing', () => {
        const conflict = {
            local: { goalTargets: { goalXYZ: 10 }, goalFixed: {} },
            remote: { goalTargets: { goalXYZ: 15 }, goalFixed: {} }
        };
        const items = buildConflictDiffItemsForMap(conflict, {});
        expect(items).toHaveLength(1);
        expect(items[0].goalName).toMatch(/^Goal goalXYZ/);
    });

    it('detects FSM-only differences for conflict explanation parity', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 15 },
                        fixedByCode: { BBB: true },
                        tagsByCode: { AAA: 'cash' },
                        tagCatalog: ['cash'],
                        driftSettings: { warningPct: 10 }
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 25 },
                        fixedByCode: { BBB: false },
                        tagsByCode: { AAA: 'income' },
                        tagCatalog: ['income'],
                        driftSettings: { warningPct: 12 }
                    }
                }
            }
        };

        const fsmItems = buildFsmConflictDiffItems(conflict);
        expect(fsmItems.length).toBeGreaterThan(0);

        const sections = buildConflictDiffSections(conflict, {});
        expect(sections.endowus).toHaveLength(0);
        expect(sections.fsm.length).toBeGreaterThan(0);
    });

    it('formats sync values', () => {
        expect(formatSyncTarget(12.345)).toBe('12.35%');
        expect(formatSyncTarget(null)).toBe('-');
        expect(formatSyncFixed(true)).toBe('Yes');
        expect(formatSyncFixed(false)).toBe('No');
    });
});
