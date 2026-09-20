import {
    ItemBookComponent,
    ItemComponentTypes,
    Player,
} from '@minecraft/server';
import { CustomForm } from '@minecraft/server-ui';
import { SlotHandle } from '../core/SlotHandle';
import { ItemEditorService } from '../item/ItemEditorService';
import { Result, attempt, fail, ok } from '../util/Result';
import { Dialog, Menu } from './Menu';
import { writableString } from './observables';
import { ExitSignal } from './ExitSignal';
import { open } from './screens';
import { notify } from './feedback';
import { itemRef } from '../util/names';

const PREVIEW_LENGTH = 28;

export class BookEditor {
    constructor(
        private readonly viewer: Player,
        private readonly slot: SlotHandle
    ) {}

    static supports(slot: SlotHandle): boolean {
        const item = ItemEditorService.require(slot);
        return item.ok && item.value.hasComponent(ItemComponentTypes.Book);
    }

    async browse(): Promise<Result<void>> {
        for (;;) {
            if (ExitSignal.isRequested(this.viewer)) {
                return ok(undefined);
            }

            const book = this.read();
            if (!book.ok) {
                return book;
            }

            const { pages, title, author, isSigned } = book.value;
            let acted = false;

            const menu = new Menu(this.viewer, 'Book')
                .withBack()
                .body(
                    isSigned
                        ? `"${title}" by ${author}. Signed, ${pages.length} page(s).`
                        : `Unsigned draft, ${pages.length} page(s).`
                );

            pages.forEach((page, index) => {
                menu.option(
                    `${index + 1}. ${preview(page)}`,
                    async () => {
                        acted = true;
                        await this.editPage(index, page);
                    },
                    'Edit or remove this page'
                );
            });

            menu.section('Book').option(
                'New page',
                async () => {
                    acted = true;
                    await this.editPage(pages.length, '');
                },
                'Add a page to the end'
            );

            menu.option(
                isSigned ? 'Re-sign book' : 'Sign book',
                async () => {
                    acted = true;
                    await this.sign(title, author);
                },
                'Set the title and author'
            );

            const shown = await menu.show();
            if (!shown.ok) {
                return shown;
            }
            if (!acted) {
                return ok(undefined);
            }
        }
    }

    private async editPage(index: number, current: string): Promise<void> {
        const exists = current.length > 0;
        const form = new CustomForm(
            this.viewer,
            exists ? `Page ${index + 1}` : 'New page'
        );

        const text = writableString(current);
        form.textField('Text', text, {
            description: 'One page of the book',
        });

        let action: 'save' | 'remove' | undefined;
        form.divider();
        form.button('Save', () => {
            action = 'save';
            form.close();
        });

        if (exists) {
            form.button(
                'Remove page',
                () => {
                    action = 'remove';
                    form.close();
                },
                { tooltip: 'Delete this page' }
            );
        }

        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok || !action) {
            return;
        }

        const book = this.read();
        if (!book.ok) {
            return;
        }

        const pages = [...book.value.pages];
        if (action === 'remove') {
            pages.splice(index, 1);
        } else {
            const value = text.getData();
            if (value.trim().length === 0) {
                pages.splice(index, 1);
            } else {
                pages[index] = value;
            }
        }

        this.report(this.writePages(pages));
    }

    private async sign(title: string, author: string): Promise<void> {
        const form = new CustomForm(this.viewer, 'Sign book');
        form.label('Signing makes the book read-only in game.');
        form.spacer();

        const titleField = writableString(title);
        const authorField = writableString(author);
        form.textField('Title', titleField, {
            description: 'Shown on the book in the inventory',
        });
        form.textField('Author', authorField, {
            description: 'Shown under the title',
        });

        let confirmed = false;
        form.divider();
        form.button('Sign', () => {
            confirmed = true;
            form.close();
        });
        form.closeButton();

        const shown = await open(form, this.viewer);
        if (!shown.ok || !confirmed) {
            return;
        }

        const name = titleField.getData().trim();
        const by = authorField.getData().trim();
        if (name.length === 0 || by.length === 0) {
            await Dialog.alert(
                this.viewer,
                'Sign book',
                'Signing needs a title and an author.'
            );
            return;
        }

        this.report(
            this.mutate('signing the book', (book) => book.signBook(name, by))
        );
    }

    private writePages(pages: string[]): Result<string> {
        return this.mutate(`${pages.length} page(s)`, (book) =>
            book.setContents(pages)
        );
    }

    private mutate(
        what: string,
        change: (book: ItemBookComponent) => void
    ): Result<string> {
        const current = ItemEditorService.require(this.slot);
        if (!current.ok) {
            return current;
        }

        const item = current.value;
        const book = item.getComponent(ItemComponentTypes.Book);
        if (!book) {
            return fail(`${itemRef(item)} is not a book.`);
        }

        return attempt(() => {
            change(book);
            this.slot.write(item);
            return `Updated ${what}.`;
        }, 'Failed to write the book');
    }

    private read(): Result<{
        pages: string[];
        title: string;
        author: string;
        isSigned: boolean;
    }> {
        const item = ItemEditorService.require(this.slot);
        if (!item.ok) {
            return item;
        }

        const book = item.value.getComponent(ItemComponentTypes.Book);
        if (!book) {
            return fail(`${itemRef(item.value)} is not a book.`);
        }

        return ok({
            pages: book.contents.map((page) => page ?? ''),
            title: book.title ?? '',
            author: book.author ?? '',
            isSigned: book.isSigned,
        });
    }

    private report(outcome: Result<string>): void {
        notify(this.viewer, outcome);
    }
}

function preview(page: string): string {
    const trimmed = page.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) {
        return '(empty)';
    }
    return trimmed.length > PREVIEW_LENGTH
        ? `${trimmed.slice(0, PREVIEW_LENGTH - 1)}…`
        : trimmed;
}
