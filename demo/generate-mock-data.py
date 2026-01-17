#!/usr/bin/env python3
"""
Screenshot generator for Goal Portfolio Viewer
Uses Playwright to open the demo page and capture screenshots
"""

import json
import os
import random

def generate_mock_data():
    """Generate mock API data for House Purchase and Retirement buckets"""
    
    def create_goals(bucket_name, goal_types):
        """Create goals for a bucket"""
        goals = []
        for i, goal_type in enumerate(goal_types, 1):
            target_amount = goal_type['targetAmount']
            # Add random variation from targets
            # Range provides -8% to +10% variation for demo realism
            variation = random.uniform(0.92, 1.10)
            investment = round(target_amount * variation, 2)
            
            # Generate return
            min_return = goal_type.get('minReturn', -0.05)
            max_return = goal_type.get('maxReturn', 0.15)
            return_rate = min_return + random.random() * (max_return - min_return)
            returns = round(investment * return_rate, 2)
            simple_rate = returns / investment if investment != 0 else 0
            
            goal_id = f"mock-goal-{bucket_name.lower().replace(' ', '-')}-{i}"
            goals.append({
                'goalId': goal_id,
                'goalName': f"{bucket_name} - {goal_type['name']}",
                'goalBucket': bucket_name,
                'goalType': 'GENERAL_WEALTH_ACCUMULATION',
                'totalInvestmentAmount': investment,
                'totalCumulativeReturn': returns,
                'simpleRateOfReturnPercent': simple_rate,
                'targetAmount': target_amount,
                'targetAllocation': goal_type['targetAllocation']
            })
        
        return goals
    
    # Define House Purchase bucket goals (~200k SGD)
    # Target Allocation: 70% Core-Balanced, 10% Megatrends, 10% Tech, 10% China
    house_goals = create_goals('House Purchase', [
        {'name': 'Core - Balanced', 'targetAmount': 140000, 'targetAllocation': 70, 'minReturn': 0.05, 'maxReturn': 0.12},
        {'name': 'Megatrends', 'targetAmount': 20000, 'targetAllocation': 10, 'minReturn': 0.03, 'maxReturn': 0.15},
        {'name': 'Tech', 'targetAmount': 20000, 'targetAllocation': 10, 'minReturn': -0.02, 'maxReturn': 0.20},
        {'name': 'China', 'targetAmount': 20000, 'targetAllocation': 10, 'minReturn': -0.08, 'maxReturn': 0.18}
    ])
    
    # Define Retirement bucket goals (~60k SGD)
    # Target Allocation: 55% Core-Aggressive, 15% Megatrends, 15% Tech, 15% China
    retirement_goals = create_goals('Retirement', [
        {'name': 'Core - Aggressive', 'targetAmount': 33000, 'targetAllocation': 55, 'minReturn': 0.06, 'maxReturn': 0.14},
        {'name': 'Megatrends', 'targetAmount': 9000, 'targetAllocation': 15, 'minReturn': 0.03, 'maxReturn': 0.15},
        {'name': 'Tech', 'targetAmount': 9000, 'targetAllocation': 15, 'minReturn': -0.02, 'maxReturn': 0.20},
        {'name': 'China', 'targetAmount': 9000, 'targetAllocation': 15, 'minReturn': -0.08, 'maxReturn': 0.18}
    ])
    
    all_goals = house_goals + retirement_goals
    
    # Create API response structures matching the expected format
    performance_data = []
    investible_data = []
    summary_data = []
    
    for goal in all_goals:
        performance_data.append({
            'goalId': goal['goalId'],
            'totalCumulativeReturn': {'amount': goal['totalCumulativeReturn']},
            'simpleRateOfReturnPercent': goal['simpleRateOfReturnPercent']
        })
        
        investible_data.append({
            'goalId': goal['goalId'],
            'goalName': goal['goalName'],
            'investmentGoalType': goal['goalType'],
            'totalInvestmentAmount': {
                'display': {'amount': goal['totalInvestmentAmount']}
            }
        })
        
        summary_data.append({
            'goalId': goal['goalId'],
            'goalName': goal['goalName'],
            'investmentGoalType': goal['goalType']
        })
    
    return {
        'performance': performance_data,
        'investible': investible_data,
        'summary': summary_data
    }

def generate_bucket_config_doc(mock_data, output_file):
    """Generate markdown documentation for bucket configuration"""
    
    # Build bucket structure from mock data
    buckets = {}
    for goal in mock_data['investible']:
        bucket = goal['goalName'].split(' - ')[0]
        if bucket not in buckets:
            buckets[bucket] = {
                'goals': [],
                'total_target': 0,
                'total_actual': 0,
                'total_returns': 0
            }
        
        # Get performance data
        perf = next(p for p in mock_data['performance'] if p['goalId'] == goal['goalId'])
        
        goal_name = ' - '.join(goal['goalName'].split(' - ')[1:])
        actual = goal['totalInvestmentAmount']['display']['amount']
        returns = perf['totalCumulativeReturn']['amount']
        
        buckets[bucket]['goals'].append({
            'name': goal_name,
            'actual': actual,
            'returns': returns,
            'return_pct': perf['simpleRateOfReturnPercent'] * 100
        })
        buckets[bucket]['total_actual'] += actual
        buckets[bucket]['total_returns'] += returns
    
    # Generate markdown
    with open(output_file, 'w') as f:
        f.write('# Demo Bucket Configuration\n\n')
        f.write('*Generated on: ' + __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '*\n\n')
        f.write('This document tracks the bucket and target configuration used in the demo.\n\n')
        f.write('---\n\n')
        
        for bucket_name, bucket_data in sorted(buckets.items()):
            total_actual = bucket_data['total_actual']
            total_returns = bucket_data['total_returns']
            growth_pct = (total_returns / total_actual * 100) if total_actual > 0 else 0
            
            f.write(f'## {bucket_name} Bucket\n\n')
            f.write(f'**Total Actual Investment:** ${total_actual:,.2f}\n\n')
            f.write(f'**Total Returns:** ${total_returns:,.2f} ({growth_pct:+.2f}%)\n\n')
            f.write(f'**Ending Balance:** ${total_actual + total_returns:,.2f}\n\n')
            
            f.write('### Goals Breakdown\n\n')
            f.write('| Goal | Actual Investment | Returns | Return % | Ending Balance |\n')
            f.write('|------|-------------------|---------|----------|----------------|\n')
            
            for goal in bucket_data['goals']:
                ending = goal['actual'] + goal['returns']
                f.write(f"| {goal['name']} | ${goal['actual']:,.2f} | ${goal['returns']:,.2f} | {goal['return_pct']:+.2f}% | ${ending:,.2f} |\n")
            
            f.write('\n### Target Allocations\n\n')
            f.write('| Goal | Target % | Actual % | Target Amount | Actual Amount | Variance |\n')
            f.write('|------|----------|----------|---------------|---------------|----------|\n')
            
            # Calculate actual allocations
            for goal in bucket_data['goals']:
                actual_pct = (goal['actual'] / total_actual * 100) if total_actual > 0 else 0
                
                # Infer target from bucket structure
                if bucket_name == 'House Purchase':
                    target_amounts = {
                        'Core - Balanced': (140000, 70),
                        'Megatrends': (20000, 10),
                        'Tech': (20000, 10),
                        'China': (20000, 10)
                    }
                elif bucket_name == 'Retirement':
                    target_amounts = {
                        'Core - Aggressive': (33000, 55),
                        'Megatrends': (9000, 15),
                        'Tech': (9000, 15),
                        'China': (9000, 15)
                    }
                else:
                    target_amounts = {}
                
                target_amt, target_pct = target_amounts.get(goal['name'], (0, 0))
                variance_pct = actual_pct - target_pct
                
                f.write(f"| {goal['name']} | {target_pct}% | {actual_pct:.2f}% | ${target_amt:,.2f} | ${goal['actual']:,.2f} | {variance_pct:+.2f}% |\n")
            
            f.write('\n---\n\n')
        
        f.write('## Usage Notes\n\n')
        f.write('- All actual investments have realistic variance from targets (-8% to +10%) for demo realism\n')
        f.write('- Returns are randomized within specified ranges per goal type\n')
        f.write('- Regenerate this file whenever running `generate-mock-data.py`\n')
        f.write('- Use this configuration as reference for future demo updates\n')

def main():
    """Generate mock data and save to JSON file"""
    mock_data = generate_mock_data()
    
    # Save to file
    output_file = os.path.join(os.path.dirname(__file__), 'mock-data.json')
    with open(output_file, 'w') as f:
        json.dump(mock_data, f, indent=2)
    
    print(f"Mock data generated and saved to {output_file}")
    print(f"Generated {len(mock_data['performance'])} goals across House Purchase and Retirement buckets")
    
    # Print summary
    print("\nSummary:")
    buckets = {}
    for goal in mock_data['investible']:
        bucket = goal['goalName'].split(' - ')[0]
        if bucket not in buckets:
            buckets[bucket] = {'count': 0, 'total': 0, 'returns': 0}
        buckets[bucket]['count'] += 1
        buckets[bucket]['total'] += goal['totalInvestmentAmount']['display']['amount']
    
    # Add returns
    for goal in mock_data['performance']:
        goal_name = next(g['goalName'] for g in mock_data['investible'] if g['goalId'] == goal['goalId'])
        bucket = goal_name.split(' - ')[0]
        buckets[bucket]['returns'] += goal['totalCumulativeReturn']['amount']
    
    for bucket, data in buckets.items():
        growth_pct = (data['returns'] / data['total'] * 100) if data['total'] > 0 else 0
        print(f"  {bucket}: {data['count']} goals, ${data['total']:,.2f} total investment, ${data['returns']:,.2f} returns ({growth_pct:+.2f}%)")
    
    # Generate bucket configuration documentation
    config_file = os.path.join(os.path.dirname(__file__), 'BUCKET_CONFIGURATION.md')
    generate_bucket_config_doc(mock_data, config_file)
    print(f"\nBucket configuration saved to {config_file}")

if __name__ == '__main__':
    main()
