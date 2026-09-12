import os
import sys
sys.path.insert(0, os.path.abspath('.'))

project = 'SCPI-flow'
copyright = '2026, SCPI-flow Team'
author = 'SCPI-flow Team'

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.napoleon',
    'sphinx.ext.viewcode',
]

templates_path = ['_templates']
exclude_patterns = []

html_theme = 'furo'
html_static_path = ['_static']
