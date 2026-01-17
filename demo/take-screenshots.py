#!/usr/bin/env python3
"""
Take screenshots of the Goal Portfolio Viewer demo
Uses Playwright browser automation
"""

import asyncio
import os
import sys

async def take_screenshots():
    """Open demo page and take screenshots"""
    
    # Get the demo directory path
    demo_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(os.path.dirname(demo_dir), 'assets')
    
    # Ensure assets directory exists
    os.makedirs(assets_dir, exist_ok=True)
    
    # Path to the demo HTML file
    demo_html_path = os.path.join(demo_dir, 'index.html')
    demo_url = f'file://{demo_html_path}'
    
    print(f"Opening demo page: {demo_url}")
    print(f"Screenshots will be saved to: {assets_dir}")
    
    # Note: We can't use Playwright directly in Python without proper imports
    # Let's use the MCP Playwright tool instead through a different approach
    # For now, print instructions for manual screenshot
    
    print("\n" + "="*60)
    print("MANUAL SCREENSHOT INSTRUCTIONS")
    print("="*60)
    print(f"\n1. Open the demo page in your browser:")
    print(f"   {demo_url}")
    print(f"\n2. Wait for the page to load completely")
    print(f"\n3. Click the '📊 Portfolio Viewer' button in the bottom-right")
    print(f"\n4. Take the following screenshots:")
    print(f"   a) Summary view (default view showing both buckets)")
    print(f"      Save as: {os.path.join(assets_dir, 'screenshot-summary.png')}")
    print(f"   b) Select 'House Purchase' from dropdown, take screenshot")
    print(f"      Save as: {os.path.join(assets_dir, 'screenshot-house-purchase-detail.png')}")
    print(f"   c) Select 'Retirement' from dropdown, take screenshot")
    print(f"      Save as: {os.path.join(assets_dir, 'screenshot-retirement-detail.png')}")
    print("\n" + "="*60)
    
    return demo_url

def main():
    """Main entry point"""
    loop = asyncio.get_event_loop()
    demo_url = loop.run_until_complete(take_screenshots())
    
    print(f"\nDemo URL: {demo_url}")
    print("\nNote: Since we're in a sandboxed environment, you'll need to")
    print("manually open the URL and take screenshots.")

if __name__ == '__main__':
    main()
