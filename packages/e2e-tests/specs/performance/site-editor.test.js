/**
 * External dependencies
 */
import { join } from 'path';

/**
 * WordPress dependencies
 */
import {
	activateTheme,
	canvas,
	createNewPost,
	visitSiteEditor,
	saveDraft,
	insertBlock,
	deleteAllTemplates,
	enterEditMode,
} from '@wordpress/e2e-test-utils';

/**
 * Internal dependencies
 */
import {
	readFile,
	deleteFile,
	writeTestResultsFile,
	getTypingEventDurations,
	getLoadingDurations,
	sequence,
} from './utils';

jest.setTimeout( 1000000 );

const results = {
	serverResponse: [],
	firstPaint: [],
	domContentLoaded: [],
	loaded: [],
	firstContentfulPaint: [],
	firstBlock: [],
	type: [],
	typeContainer: [],
	focus: [],
	inserterOpen: [],
	inserterHover: [],
	inserterSearch: [],
	listViewOpen: [],
};

let postId;

describe( 'Site Editor Performance', () => {
	beforeAll( async () => {
		await activateTheme( 'emptytheme' );
		await deleteAllTemplates( 'wp_template' );
		await deleteAllTemplates( 'wp_template_part' );

		const html = readFile(
			join( __dirname, '../../assets/large-post.html' )
		);

		await createNewPost( { postType: 'page' } );

		await page.evaluate( ( _html ) => {
			const { parse } = window.wp.blocks;
			const { dispatch } = window.wp.data;
			const blocks = parse( _html );

			blocks.forEach( ( block ) => {
				if ( block.name === 'core/image' ) {
					delete block.attributes.id;
					delete block.attributes.url;
				}
			} );

			dispatch( 'core/block-editor' ).resetBlocks( blocks );
		}, html );
		await saveDraft();

		postId = await page.evaluate( () =>
			new URL( document.location ).searchParams.get( 'post' )
		);
	} );

	afterAll( async () => {
		writeTestResultsFile( __filename, results );

		await deleteAllTemplates( 'wp_template' );
		await deleteAllTemplates( 'wp_template_part' );
		await activateTheme( 'twentytwentyone' );
	} );

	describe( 'Loading', () => {
		// Number of measurements to take.
		const samples = 3;
		// Number of throwaway measurements to perform before recording samples.
		// Having at least one helps ensure that caching quirks don't manifest
		// in the results.
		const throwaway = 1;
		const iterations = sequence( 1, samples + throwaway );

		it.each( iterations )(
			`trace large post loading durations (%i of ${ iterations.length })`,
			async ( i ) => {
				// Open the test page in Site Editor.
				await visitSiteEditor( {
					postId,
					postType: 'page',
				} );

				// Wait for the first content block to render.
				await canvas().waitForSelector(
					'[data-type="core/post-content"] .wp-block'
				);

				if ( i > throwaway ) {
					const {
						serverResponse,
						firstPaint,
						domContentLoaded,
						loaded,
						firstContentfulPaint,
						firstBlock,
					} = await getLoadingDurations();

					results.serverResponse.push( serverResponse );
					results.firstPaint.push( firstPaint );
					results.domContentLoaded.push( domContentLoaded );
					results.loaded.push( loaded );
					results.firstContentfulPaint.push( firstContentfulPaint );
					results.firstBlock.push( firstBlock );
				}

				expect( true ).toBe( true );
			}
		);
	} );

	describe( 'Typing', () => {
		it( 'trace 200 characters typing sequence inside a large post', async () => {
			// Open the test page in Site Editor.
			await visitSiteEditor( {
				postId,
				postType: 'page',
			} );

			// Wait for the first paragraph to be ready.
			const firstParagraph = await canvas().waitForXPath(
				'//p[contains(text(), "Lorem ipsum dolor sit amet")]'
			);

			// Get inside the post content.
			await enterEditMode();

			// Insert a new paragraph right under the first one.
			await firstParagraph.focus();
			await insertBlock( 'Paragraph' );

			// Start tracing.
			const traceFile = __dirname + '/trace.json';
			await page.tracing.start( {
				path: traceFile,
				screenshots: false,
				categories: [ 'devtools.timeline' ],
			} );

			// Type "x" 200 times.
			await page.keyboard.type( new Array( 200 ).fill( 'x' ).join( '' ) );

			// Stop tracing and save results.
			await page.tracing.stop();
			const traceResults = JSON.parse( readFile( traceFile ) );
			const [ keyDownEvents, keyPressEvents, keyUpEvents ] =
				getTypingEventDurations( traceResults );
			for ( let i = 0; i < keyDownEvents.length; i++ ) {
				results.type.push(
					keyDownEvents[ i ] + keyPressEvents[ i ] + keyUpEvents[ i ]
				);
			}

			// Delete the original trace file.
			deleteFile( traceFile );

			expect( true ).toBe( true );
		} );
	} );
} );
