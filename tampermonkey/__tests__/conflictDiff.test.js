const {
    buildConflictDiffItems: buildConflictDiffItemsForMap,
    buildConflictDiffSections,
    buildFsmConflictDiffItems,
    buildOcbcConflictDiffItems,
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
        expect(items[0].localBucketDisplay).toBe('-');
        expect(items[0].remoteBucketDisplay).toBe('-');
    });

    it('detects explicit bucket assignment change', () => {
        const conflict = {
            local: { goalTargets: {}, goalFixed: {}, goalBuckets: { goal1: 'Retirement' } },
            remote: { goalTargets: {}, goalFixed: {}, goalBuckets: { goal1: 'Education' } }
        };
        const items = buildConflictDiffItemsForMap(conflict, { goal1: 'Goal One' });
        expect(items).toHaveLength(1);
        expect(items[0].localBucketDisplay).toBe('Retirement');
        expect(items[0].remoteBucketDisplay).toBe('Education');
    });

    it('detects cleared bucket marker differences', () => {
        const conflict = {
            local: { goalTargets: {}, goalFixed: {}, goalBuckets: {}, clearedGoalBuckets: { goal1: true } },
            remote: { goalTargets: {}, goalFixed: {}, goalBuckets: { goal1: 'Retirement' }, clearedGoalBuckets: {} }
        };
        const items = buildConflictDiffItemsForMap(conflict, { goal1: 'Goal One' });
        expect(items).toHaveLength(1);
        expect(items[0].localBucketDisplay).toBe('Cleared');
        expect(items[0].remoteBucketDisplay).toBe('Retirement');
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

    it('detects OCBC allocation bucket and sub-portfolio differences', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: { growth: { label: 'Growth' } },
                        subPortfolios: { goal: { P001: [{ id: 'sp1', name: 'Core', archived: false }] } },
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: { growth: { label: 'Growth+' } },
                        subPortfolios: { goal: { P001: [{ id: 'sp2', name: 'Satellite', archived: false }] } },
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        expect(rows.some(item => item.section === 'definition' && item.settingName === 'Allocation Buckets')).toBe(true);
        expect(rows.some(item => item.section === 'definition' && item.settingName === 'Sub-portfolios')).toBe(true);
    });

    it('detects OCBC keep-current-allocation scope differences', () => {
        const conflict = {
            local: {
                version: 4,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {},
                        fixedByScope: { 'assets|P-1|core|': true }
                    }
                }
            },
            remote: {
                version: 4,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {},
                        fixedByScope: {}
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        expect(rows.some(item => item.section === 'target' && item.settingName === 'Keep current allocation scopes')).toBe(true);
    });

    it('shows OCBC sub-portfolio legacy linkage and preserves inner order', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {
                            goal: {
                                P001: [
                                    { id: 'sp2', name: 'Second', archived: false },
                                    { id: 'sp1', name: 'First', archived: false, legacyProductType: 'MUTUAL_FUND', legacyBucketId: 'bucket-1' }
                                ]
                            }
                        },
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {
                            goal: {
                                P001: [
                                    { id: 'sp1', name: 'First', archived: false, legacyProductType: 'BOND', legacyBucketId: 'bucket-1' },
                                    { id: 'sp2', name: 'Second', archived: false }
                                ]
                            }
                        },
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        const subPortfolioRow = rows.find(item => item.settingName === 'Sub-portfolios');
        expect(subPortfolioRow).toBeTruthy();
        expect(subPortfolioRow.localDisplay).toContain('Second (sp2) | First (sp1) [legacy MUTUAL_FUND:bucket-1]');
        expect(subPortfolioRow.remoteDisplay).toContain('First (sp1) [legacy BOND:bucket-1] | Second (sp2)');
    });

    it('detects OCBC assignment and order differences', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: { AAPL: 'sp1' },
                        orderByScope: { goal: ['AAPL', 'BOND'] },
                        targetsByScope: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: { AAPL: 'sp2' },
                        orderByScope: { goal: ['BOND', 'AAPL'] },
                        targetsByScope: {}
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        expect(rows.some(item => item.section === 'assignment' && item.settingName === 'Code assignments')).toBe(true);
        expect(rows.some(item => item.section === 'assignment' && item.settingName === 'Display order')).toBe(true);
    });

    it('detects OCBC target differences', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: { goal: 20 }
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: { goal: 25 }
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        const targetRow = rows.find(item => item.section === 'target');
        expect(targetRow).toBeTruthy();
        expect(targetRow.settingName).toBe('Allocation targets');
    });

    it('adds OCBC section into combined conflict sections', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} },
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: { global: 10 }
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} },
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: { global: 12 }
                    }
                }
            }
        };

        const sections = buildConflictDiffSections(conflict, {});
        expect(Array.isArray(sections.ocbc)).toBe(true);
        expect(sections.ocbc.length).toBeGreaterThan(0);
    });

    it('ignores OCBC local-only holdings fields and raw payload differences', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} },
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {},
                        holdings: [{ code: 'AAA', name: 'Alpha' }],
                        holdingsByPortfolio: { P001: [{ code: 'AAA', name: 'Alpha' }] },
                        raw: { payloadVersion: 1 }
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    endowus: { goalTargets: {}, goalFixed: {} },
                    fsm: { targetsByCode: {}, fixedByCode: {}, portfolios: [], assignmentByCode: {} },
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {},
                        holdings: [{ code: 'BBB', name: 'Beta' }],
                        holdingsByPortfolio: { P999: [{ code: 'BBB', name: 'Beta' }] },
                        raw: { payloadVersion: 2 }
                    }
                }
            }
        };

        expect(buildOcbcConflictDiffItems(conflict)).toHaveLength(0);

        const sections = buildConflictDiffSections(conflict, {});
        expect(sections.ocbc).toHaveLength(0);
        expect(sections.endowus).toHaveLength(0);
        expect(sections.fsm).toHaveLength(0);
    });

    it('does not diff allocation buckets when nested key order differs only', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {
                            growth: {
                                label: 'Growth',
                                config: { alpha: 1, beta: 2 }
                            }
                        },
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {
                            growth: {
                                config: { beta: 2, alpha: 1 },
                                label: 'Growth'
                            }
                        },
                        subPortfolios: {},
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        expect(rows.some(item => item.settingName === 'Allocation Buckets')).toBe(false);
    });

    it('uses top-level OCBC fallback when platforms is missing or malformed', () => {
        const cases = [
            {
                local: {
                    version: 2,
                    platforms: 'malformed',
                    allocationBuckets: {},
                    subPortfolios: {},
                    assignmentByCode: { AAPL: 'sp1', BOND: 'sp2' },
                    orderByScope: { goal: ['AAPL', 'BOND'] },
                    targetsByScope: { goal: 20, global: 80 }
                },
                remote: {
                    version: 2,
                    platforms: {
                        ocbc: {
                            allocationBuckets: {},
                            subPortfolios: {},
                            assignmentByCode: { AAPL: 'sp1', BOND: 'sp2' },
                            orderByScope: { goal: ['AAPL', 'BOND'] },
                            targetsByScope: { goal: 20, global: 80 }
                        }
                    }
                }
            },
            {
                local: {
                    version: 2,
                    allocationBuckets: {},
                    subPortfolios: {},
                    assignmentByCode: { AAPL: 'sp1' },
                    orderByScope: { goal: ['AAPL'] },
                    targetsByScope: { goal: 20 }
                },
                remote: {
                    version: 2,
                    platforms: {
                        ocbc: {
                            allocationBuckets: {},
                            subPortfolios: {},
                            assignmentByCode: { AAPL: 'sp1' },
                            orderByScope: { goal: ['AAPL'] },
                            targetsByScope: { goal: 20 }
                        }
                    }
                }
            }
        ];

        cases.forEach(({ local, remote }) => {
            expect(buildOcbcConflictDiffItems({ local, remote })).toHaveLength(0);
        });
    });

    it('does not diff OCBC assignments and targets when object insertion order differs only', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: { AAPL: 'sp1', BOND: 'sp2' },
                        orderByScope: {},
                        targetsByScope: { goal: 20, global: 80 }
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {},
                        assignmentByCode: { BOND: 'sp2', AAPL: 'sp1' },
                        orderByScope: {},
                        targetsByScope: { global: 80, goal: 20 }
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        expect(rows.some(item => item.settingName === 'Code assignments')).toBe(false);
        expect(rows.some(item => item.settingName === 'Allocation targets')).toBe(false);
    });

    it('does not diff OCBC sub-portfolios when top-level key order differs only', () => {
        const conflict = {
            local: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {
                            goal: {
                                P001: [
                                    { id: 'sp1', name: 'First', archived: false },
                                    { id: 'sp2', name: 'Second', archived: false }
                                ]
                            },
                            global: {
                                P100: [
                                    { id: 'sp3', name: 'Third', archived: false }
                                ]
                            }
                        },
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            },
            remote: {
                version: 2,
                platforms: {
                    ocbc: {
                        allocationBuckets: {},
                        subPortfolios: {
                            global: {
                                P100: [
                                    { id: 'sp3', name: 'Third', archived: false }
                                ]
                            },
                            goal: {
                                P001: [
                                    { id: 'sp1', name: 'First', archived: false },
                                    { id: 'sp2', name: 'Second', archived: false }
                                ]
                            }
                        },
                        assignmentByCode: {},
                        orderByScope: {},
                        targetsByScope: {}
                    }
                }
            }
        };

        const rows = buildOcbcConflictDiffItems(conflict);
        expect(rows.some(item => item.settingName === 'Sub-portfolios')).toBe(false);
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
        expect(assignmentRow.localDisplay).toBe('Core (core) · Target 5.00% · Fixed No');
        expect(assignmentRow.remoteDisplay).toBe('Income (income) · Target 10.00% · Fixed No');
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
        expect(assignmentRow.localDisplay).toBe('Core (core) · Target 12.00% · Fixed Yes');
        expect(assignmentRow.remoteDisplay).toBe('Income (income) · Target 20.00% · Fixed No');
    });

    it('keeps duplicate FSM codes distinct with subcode identities', () => {
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
                        assignmentByCode: { 'AAA|sub:AAPL': 'core' },
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
                        assignmentByCode: { 'AAA|sub:CASH': 'income' },
                        driftSettings: {}
                    }
                }
            }
        };

        const fsmItems = buildFsmConflictDiffItems(conflict, {
            fsmHoldings: [
                { code: 'AAA', subcode: 'AAPL', name: 'Equity Sleeve' },
                { code: 'AAA', subcode: 'CASH', name: 'Cash Sleeve' }
            ]
        });

        expect(fsmItems.some(item => item.section === 'assignment' && item.settingName === 'Equity Sleeve (AAA / AAPL)')).toBe(true);
        expect(fsmItems.some(item => item.section === 'assignment' && item.settingName === 'Cash Sleeve (AAA / CASH)')).toBe(true);
    });
});
