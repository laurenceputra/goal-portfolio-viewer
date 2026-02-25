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

    it('keeps Endowus-only changes visible', () => {
        const conflict = {
            local: { goalTargets: { goal1: 10 }, goalFixed: {} },
            remote: { goalTargets: { goal1: 20 }, goalFixed: {} }
        };

        const sections = buildConflictDiffSections(conflict, { goal1: 'Goal One' });
        expect(sections.endowus).toHaveLength(1);
        expect(sections.fsm).toHaveLength(0);
    });

    it('shows both Endowus and FSM diffs when mixed', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: { goal1: 10 }, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 10 },
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        driftSettings: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: { goal1: 20 }, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 15 },
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        driftSettings: {}
                    }
                }
            }
        };

        const sections = buildConflictDiffSections(conflict, { goal1: 'Goal One' });
        expect(sections.endowus.length).toBeGreaterThan(0);
        expect(sections.fsm.length).toBeGreaterThan(0);
    });

    it('formats sync values', () => {
        expect(formatSyncTarget(12.345)).toBe('12.35%');
        expect(formatSyncTarget(null)).toBe('-');
        expect(formatSyncFixed(true)).toBe('Yes');
        expect(formatSyncFixed(false)).toBe('No');
    });

    it('detects FSM portfolio definition and assignment differences', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: {},
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        portfolios: [{ id: 'core', name: 'Core', archived: false }],
                        assignmentByCode: { AAA: 'core' },
                        driftSettings: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: {},
                        fixedByCode: {},
                        tagsByCode: {},
                        tagCatalog: [],
                        portfolios: [{ id: 'income', name: 'Income', archived: false }],
                        assignmentByCode: { AAA: 'income' },
                        driftSettings: {}
                    }
                }
            }
        };

        const fsmItems = buildFsmConflictDiffItems(conflict);
        expect(fsmItems.some(item => item.section === 'definition')).toBe(true);
        expect(fsmItems.some(item => item.section === 'assignment' && item.settingName === 'AAA')).toBe(true);
    });

    it('falls back to code when holdings metadata missing', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { BBB: 5 },
                        fixedByCode: { BBB: false },
                        tagsByCode: { BBB: 'growth' },
                        tagCatalog: ['growth'],
                        portfolios: [{ id: 'core', name: 'Core', archived: false }],
                        assignmentByCode: { BBB: 'core' },
                        driftSettings: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { BBB: 10 },
                        fixedByCode: { BBB: false },
                        tagsByCode: { BBB: 'growth' },
                        tagCatalog: ['growth'],
                        portfolios: [{ id: 'income', name: 'Income', archived: false }],
                        assignmentByCode: { BBB: 'income' },
                        driftSettings: {}
                    }
                }
            }
        };

        const fsmItems = buildFsmConflictDiffItems(conflict, { fsmHoldings: [] });
        const assignmentRow = fsmItems.find(item => item.section === 'assignment');
        expect(assignmentRow.settingName).toBe('BBB');
        expect(assignmentRow.localDisplay).toBe('Core (core) · Target 5.00% · Fixed No · Tag growth');
        expect(assignmentRow.remoteDisplay).toBe('Income (income) · Target 10.00% · Fixed No · Tag growth');
    });

    it('formats FSM assignment rows with readable labels', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 12 },
                        fixedByCode: { AAA: true },
                        tagsByCode: { AAA: 'income' },
                        tagCatalog: ['income'],
                        portfolios: [{ id: 'core', name: 'Core', archived: false }],
                        assignmentByCode: { AAA: 'core' },
                        driftSettings: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: {
                        targetsByCode: { AAA: 20 },
                        fixedByCode: { AAA: false },
                        tagsByCode: {},
                        tagCatalog: [],
                        portfolios: [{ id: 'income', name: 'Income', archived: false }],
                        assignmentByCode: { AAA: 'income' },
                        driftSettings: {}
                    }
                }
            }
        };

        const fsmItems = buildFsmConflictDiffItems(conflict, {
            fsmHoldings: [{ code: 'AAA', name: 'Global Equity Fund' }]
        });
        const assignmentRow = fsmItems.find(item => item.section === 'assignment');
        expect(assignmentRow.settingName).toBe('Global Equity Fund (AAA)');
        expect(assignmentRow.localDisplay).toBe('Core (core) · Target 12.00% · Fixed Yes · Tag income');
        expect(assignmentRow.remoteDisplay).toBe('Income (income) · Target 20.00% · Fixed No · Tag -');
    });
});
